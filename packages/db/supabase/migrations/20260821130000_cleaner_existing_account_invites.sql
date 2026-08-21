-- An account can hold employee and cleaner memberships for the same company.
-- The membership kinds keep their independent lifecycle and authority checks.
create or replace function public.join_company_pool(
  invite_code text,
  full_name text,
  phone text,
  suburb text
)
returns table (joined_company_id uuid, joined_company_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaner_id uuid := auth.uid();
  trimmed_name text := btrim(coalesce(full_name, ''));
  trimmed_phone text := btrim(coalesce(phone, ''));
  trimmed_suburb text := btrim(coalesce(suburb, ''));
  caller public.profiles;
  invite public.company_invites;
  existing public.company_members;
  company public.companies;
begin
  if cleaner_id is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;

  if trimmed_name = '' or trimmed_phone = '' or trimmed_suburb = '' then
    raise invalid_parameter_value using message = 'Full name, phone, and suburb are required';
  end if;

  select * into caller from public.profiles where id = cleaner_id;
  if not found then
    raise insufficient_privilege using message = 'Cleaner access required';
  end if;

  select * into invite
  from public.company_invites
  where code = upper(btrim(invite_code))
  for update;

  if not found then
    raise invalid_parameter_value using message = 'Invite code not found';
  end if;
  if invite.revoked_at is not null then
    raise invalid_parameter_value using message = 'Invite code is no longer active';
  end if;
  if invite.expires_at is not null and invite.expires_at <= now() then
    raise invalid_parameter_value using message = 'Invite code has expired';
  end if;

  select * into existing
  from public.company_members
  where company_id = invite.company_id
    and profile_id = cleaner_id;

  if found and existing.status = 'removed' then
    raise insufficient_privilege using message = 'This company removed you from their pool';
  end if;

  update public.profiles
  set full_name = trimmed_name,
      phone = trimmed_phone,
      suburb = trimmed_suburb
  where id = cleaner_id;

  insert into public.company_members (company_id, profile_id)
  values (invite.company_id, cleaner_id)
  on conflict (company_id, profile_id) do nothing;

  select * into company from public.companies where id = invite.company_id;

  return query select company.id, company.name;
end;
$$;
