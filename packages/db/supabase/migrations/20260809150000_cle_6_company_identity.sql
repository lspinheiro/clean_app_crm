insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'company-logos',
  'company-logos',
  false,
  400000,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.company_logo_upload_reservations (
  company_id uuid primary key references public.companies (id) on delete cascade,
  object_name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.company_logo_upload_reservations enable row level security;
revoke all on table public.company_logo_upload_reservations from anon, authenticated;
grant all on table public.company_logo_upload_reservations to service_role;

create function public.can_manage_company_logo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when $1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/logo-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
      then public.is_company_admin(split_part($1, '/', 1)::uuid)
    else false
  end
$$;

create function public.can_delete_unreferenced_company_logo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_company_logo($1)
    and not exists (
      select 1
      from public.companies company
      where company.logo_path = $1
    )
    and not exists (
      select 1
      from public.company_logo_upload_reservations reservation
      where reservation.object_name = $1
    )
$$;

create function public.can_upload_reserved_company_logo(requested_object_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  upload_allowed boolean;
begin
  if requested_object_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/logo-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$' then
    return false;
  end if;

  target_company_id := split_part(requested_object_name, '/', 1)::uuid;

  perform 1
  from public.companies company
  where company.id = target_company_id
  for update;

  if not found or not public.is_company_admin(target_company_id) then
    return false;
  end if;

  select exists (
      select 1
      from public.company_logo_upload_reservations reservation
      where reservation.company_id = target_company_id
        and reservation.object_name = requested_object_name
    )
    and (
      select count(*)
      from storage.objects object
      where object.bucket_id = 'company-logos'
        and object.name like target_company_id::text || '/%'
    ) < 2
    and not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'company-logos'
        and object.name like target_company_id::text || '/%'
        and object.name <> requested_object_name
        and not exists (
          select 1
          from public.companies company
          where company.id = target_company_id
            and company.logo_path = object.name
        )
    )
  into upload_allowed;

  return upload_allowed;
end;
$$;

create function public.reserve_company_logo_upload(
  target_company_id uuid,
  requested_object_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  unreferenced_object_name text;
begin
  perform 1
  from public.companies company
  where company.id = target_company_id
  for update;

  if not found or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if not public.can_manage_company_logo(requested_object_name)
    or split_part(requested_object_name, '/', 1) <> target_company_id::text then
    raise check_violation using message = 'Company logo path is invalid';
  end if;

  select object.name
  into unreferenced_object_name
  from storage.objects object
  where object.bucket_id = 'company-logos'
    and object.name like target_company_id::text || '/%'
    and not exists (
      select 1
      from public.companies company
      where company.logo_path = object.name
    )
  order by object.created_at, object.name
  limit 1;

  if unreferenced_object_name is not null then
    insert into public.company_logo_upload_reservations (company_id, object_name)
    values (target_company_id, requested_object_name)
    on conflict (company_id) do update
    set
      object_name = excluded.object_name,
      created_at = now();

    return unreferenced_object_name;
  end if;

  insert into public.company_logo_upload_reservations (company_id, object_name)
  values (target_company_id, requested_object_name)
  on conflict (company_id) do update
  set
    object_name = excluded.object_name,
    created_at = now();

  return requested_object_name;
end;
$$;

create policy company_logos_select_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'company-logos'
  and public.can_manage_company_logo(name)
);

create policy company_logos_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-logos'
  and public.can_upload_reserved_company_logo(name)
);

create policy company_logos_update_admin
on storage.objects
for update
to authenticated
using (
  false
)
with check (
  false
);

create policy company_logos_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-logos'
  and public.can_delete_unreferenced_company_logo(name)
);

drop policy companies_update_admin on public.companies;
revoke update on table public.companies from authenticated;

create function public.update_company_identity(
  target_company_id uuid,
  company_name text,
  company_abn text,
  company_logo_path text default null
)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_abn text := regexp_replace(company_abn, '[[:space:]]', '', 'g');
  updated_company public.companies;
begin
  perform 1
  from public.companies company
  where company.id = target_company_id
  for update;

  if not found or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if btrim(company_name) = '' then
    raise check_violation using message = 'Company name is required';
  end if;

  if canonical_abn !~ '^[0-9]{11}$' then
    raise check_violation using message = 'ABN must contain exactly 11 digits';
  end if;

  if company_logo_path is not null then
    if not public.can_manage_company_logo(company_logo_path) then
      raise check_violation using message = 'Company logo path is invalid';
    end if;

    if not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'company-logos'
        and object.name = company_logo_path
    ) then
      raise foreign_key_violation using message = 'Company logo object not found';
    end if;

    if not exists (
      select 1
      from public.company_logo_upload_reservations reservation
      where reservation.company_id = target_company_id
        and reservation.object_name = company_logo_path
    ) then
      raise foreign_key_violation using message = 'Company logo upload reservation not found';
    end if;
  end if;

  update public.companies
  set
    name = btrim(company_name),
    abn = canonical_abn,
    logo_path = coalesce(company_logo_path, logo_path)
  where id = target_company_id
    and status = 'approved'
  returning * into updated_company;

  if updated_company.id is null then
    raise no_data_found using message = 'Approved company not found';
  end if;

  if company_logo_path is not null then
    delete from public.company_logo_upload_reservations reservation
    where reservation.company_id = target_company_id
      and reservation.object_name = company_logo_path;
  end if;

  return updated_company;
end;
$$;

revoke all on function public.can_manage_company_logo(text) from public, anon;
revoke all on function public.can_delete_unreferenced_company_logo(text) from public, anon;
revoke all on function public.can_upload_reserved_company_logo(text) from public, anon;
revoke all on function public.reserve_company_logo_upload(uuid, text) from public, anon;
revoke all on function public.update_company_identity(uuid, text, text, text) from public, anon;
grant execute on function public.can_manage_company_logo(text) to authenticated, service_role;
grant execute on function public.can_delete_unreferenced_company_logo(text) to authenticated, service_role;
grant execute on function public.can_upload_reserved_company_logo(text) to authenticated, service_role;
grant execute on function public.reserve_company_logo_upload(uuid, text) to authenticated, service_role;
grant execute on function public.update_company_identity(uuid, text, text, text) to authenticated, service_role;
