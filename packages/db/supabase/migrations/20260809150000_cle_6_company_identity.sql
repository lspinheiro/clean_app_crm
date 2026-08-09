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

create function public.can_manage_company_logo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when object_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/logo[.]webp$'
      then public.is_company_admin(split_part(object_name, '/', 1)::uuid)
    else false
  end
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
  and public.can_manage_company_logo(name)
);

create policy company_logos_update_admin
on storage.objects
for update
to authenticated
using (
  bucket_id = 'company-logos'
  and public.can_manage_company_logo(name)
)
with check (
  bucket_id = 'company-logos'
  and public.can_manage_company_logo(name)
);

create policy company_logos_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-logos'
  and public.can_manage_company_logo(name)
);

drop policy companies_update_admin on public.companies;
revoke update on table public.companies from authenticated;

create function public.update_company_identity(
  target_company_id uuid,
  company_name text,
  company_abn text,
  logo_uploaded boolean default false
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
  if not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if btrim(company_name) = '' then
    raise check_violation using message = 'Company name is required';
  end if;

  if canonical_abn !~ '^[0-9]{11}$' then
    raise check_violation using message = 'ABN must contain exactly 11 digits';
  end if;

  update public.companies
  set
    name = btrim(company_name),
    abn = canonical_abn,
    logo_path = case
      when logo_uploaded then target_company_id::text || '/logo.webp'
      else logo_path
    end
  where id = target_company_id
    and status = 'approved'
  returning * into updated_company;

  if updated_company.id is null then
    raise no_data_found using message = 'Approved company not found';
  end if;

  return updated_company;
end;
$$;

revoke all on function public.can_manage_company_logo(text) from public, anon;
revoke all on function public.update_company_identity(uuid, text, text, boolean) from public, anon;
grant execute on function public.can_manage_company_logo(text) to authenticated, service_role;
grant execute on function public.update_company_identity(uuid, text, text, boolean) to authenticated, service_role;
