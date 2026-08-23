alter table public.companies
add constraint companies_abn_key unique (abn);

create function public.create_company(
  company_name text,
  company_abn text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  canonical_name text := btrim(coalesce(company_name, ''));
  canonical_abn text := regexp_replace(
    coalesce(company_abn, ''),
    '[[:space:]]',
    '',
    'g'
  );
  new_company_id uuid;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;

  if canonical_name = '' then
    raise check_violation using message = 'Company name is required';
  end if;

  if length(canonical_name) > 120 then
    raise check_violation
      using message = 'Company name must be at most 120 characters';
  end if;

  if canonical_abn !~ '^[0-9]{11}$' then
    raise check_violation using message = 'ABN must contain exactly 11 digits';
  end if;

  perform 1
  from public.profiles profile
  where profile.id = caller_id
  for update;

  if not found or not exists (
    select 1
    from public.employee_memberships membership
    join public.companies company on company.id = membership.company_id
    where membership.profile_id = caller_id
      and membership.status = 'active'
      and company.status = 'approved'
  ) then
    raise insufficient_privilege
      using message = 'Active CRM employee membership required';
  end if;

  begin
    insert into public.companies (
      name,
      abn,
      status
    )
    values (
      canonical_name,
      canonical_abn,
      'approved'
    )
    returning id into new_company_id;
  exception
    when unique_violation then
      raise unique_violation using message = 'Company ABN already exists';
  end;

  insert into public.employee_memberships (
    company_id,
    profile_id,
    role,
    status
  )
  values (
    new_company_id,
    caller_id,
    'owner',
    'active'
  );

  update public.profiles
  set last_active_company = new_company_id
  where id = caller_id;

  return new_company_id;
end;
$$;

create function public.first_admin_company_abn_available(company_abn text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  canonical_abn text := regexp_replace(
    coalesce(company_abn, ''),
    '[[:space:]]',
    '',
    'g'
  );
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;

  if canonical_abn !~ '^[0-9]{11}$' then
    raise check_violation using message = 'ABN must contain exactly 11 digits';
  end if;

  select lower(btrim(auth_user.email))
  into caller_email
  from auth.users auth_user
  where auth_user.id = caller_id
    and auth_user.email_confirmed_at is not null
    and auth_user.email is not null;

  if caller_email is null or not exists (
    select 1
    from public.first_admin_invitations invitation
    where invitation.email = caller_email
      and invitation.accepted_at is null
      and invitation.revoked_at is null
      and invitation.expires_at > now()
  ) then
    raise invalid_authorization_specification
      using message = 'Invitation is no longer available';
  end if;

  return not exists (
    select 1
    from public.companies company
    where company.abn = canonical_abn
  );
end;
$$;

create function public.release_company_logo_upload(
  target_company_id uuid,
  target_object_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.companies company
  where company.id = target_company_id
  for update;

  if not found or not public.is_company_owner(target_company_id) then
    raise insufficient_privilege using message = 'Company owner access required';
  end if;

  if not public.can_manage_company_logo(target_object_name)
    or split_part(target_object_name, '/', 1) <> target_company_id::text then
    raise check_violation using message = 'Company logo path is invalid';
  end if;

  delete from public.company_logo_upload_reservations reservation
  where reservation.company_id = target_company_id
    and reservation.object_name = target_object_name;

  return found;
end;
$$;

revoke all on function public.create_company(text, text) from public, anon;
revoke all on function public.first_admin_company_abn_available(text) from public, anon;
revoke all on function public.release_company_logo_upload(uuid, text) from public, anon;
grant execute on function public.create_company(text, text) to authenticated, service_role;
grant execute on function public.first_admin_company_abn_available(text) to authenticated, service_role;
grant execute on function public.release_company_logo_upload(uuid, text) to authenticated, service_role;
