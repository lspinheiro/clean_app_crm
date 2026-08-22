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

revoke all on function public.create_company(text, text) from public, anon;
grant execute on function public.create_company(text, text) to authenticated, service_role;
