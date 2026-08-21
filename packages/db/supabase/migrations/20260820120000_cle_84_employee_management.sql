create or replace function public.protect_last_company_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removes_active_owner boolean;
begin
  removes_active_owner := old.role = 'owner'
    and old.status = 'active'
    and (
      tg_op = 'DELETE'
      or new.role <> 'owner'
      or new.status <> 'active'
      or new.company_id is distinct from old.company_id
    );

  if not removes_active_owner then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  perform 1
  from public.companies company
  where company.id = old.company_id
  for update;

  -- A company cascade has already removed the tenant row, so there is no surviving
  -- company whose owner invariant must be protected. Other nested cascades (for
  -- example, profile deletion) still find the company and must keep its last owner.
  if not found and tg_op = 'DELETE' then
    return old;
  end if;

  if not exists (
    select 1
    from public.employee_memberships membership
    where membership.company_id = old.company_id
      and membership.id <> old.id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise check_violation using
      message = 'Company must retain at least one active owner';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create view public.employee_membership_details
with (security_invoker = false, security_barrier = true)
as
select
  membership.id as membership_id,
  membership.company_id,
  membership.profile_id,
  profile.full_name,
  auth_user.email,
  membership.role,
  membership.joined_at
from public.employee_memberships membership
join public.profiles profile on profile.id = membership.profile_id
join auth.users auth_user on auth_user.id = membership.profile_id
where membership.status = 'active'
  and auth_user.email is not null
  and public.is_company_owner(membership.company_id);

revoke all on table public.employee_membership_details from public, anon, authenticated;
grant select on table public.employee_membership_details to authenticated, service_role;

create function public.change_employee_role(
  target_company_id uuid,
  target_membership_id uuid,
  target_role public.employee_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.employee_memberships;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;
  if target_company_id is null or target_membership_id is null or target_role is null then
    raise invalid_parameter_value using message = 'Employee role details are required';
  end if;

  perform 1
  from public.companies company
  where company.id = target_company_id
  for update;

  if not public.is_company_owner(target_company_id) then
    raise insufficient_privilege using message = 'Company owner access required';
  end if;

  select membership.*
  into target
  from public.employee_memberships membership
  where membership.id = target_membership_id
    and membership.company_id = target_company_id
    and membership.status = 'active'
  for update;

  if target.id is null then
    raise invalid_parameter_value using message = 'Employee membership not found';
  end if;

  update public.employee_memberships membership
  set role = target_role
  where membership.id = target.id;
end;
$$;

create function public.remove_employee(
  target_company_id uuid,
  target_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.employee_memberships;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;
  if target_company_id is null or target_membership_id is null then
    raise invalid_parameter_value using message = 'Employee membership details are required';
  end if;

  perform 1
  from public.companies company
  where company.id = target_company_id
  for update;

  if not public.is_company_owner(target_company_id) then
    raise insufficient_privilege using message = 'Company owner access required';
  end if;

  select membership.*
  into target
  from public.employee_memberships membership
  where membership.id = target_membership_id
    and membership.company_id = target_company_id
    and membership.status = 'active'
  for update;

  if target.id is null then
    raise invalid_parameter_value using message = 'Employee membership not found';
  end if;

  update public.employee_memberships membership
  set status = 'removed'
  where membership.id = target.id;
end;
$$;

revoke all on function public.change_employee_role(uuid, uuid, public.employee_role)
from public, anon;
revoke all on function public.remove_employee(uuid, uuid)
from public, anon;
grant execute on function public.change_employee_role(uuid, uuid, public.employee_role)
to authenticated, service_role;
grant execute on function public.remove_employee(uuid, uuid)
to authenticated, service_role;

create or replace function public.accept_employee_invitation(
  target_invitation_id uuid,
  full_name text,
  target_locale public.app_locale
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  canonical_full_name text := btrim(full_name);
  invitation public.employee_invitations;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;

  select lower(btrim(auth_user.email))
  into caller_email
  from auth.users auth_user
  where auth_user.id = caller_id
    and auth_user.email_confirmed_at is not null
    and auth_user.email is not null;

  if caller_email is null then
    raise invalid_parameter_value using message = 'Invitation is no longer available';
  end if;

  select candidate.*
  into invitation
  from public.employee_invitations candidate
  where candidate.id = target_invitation_id
    and candidate.email = caller_email
  for update;

  if invitation.id is null
    or invitation.accepted_at is not null
    or invitation.revoked_at is not null
    or invitation.superseded_at is not null
    or invitation.expires_at <= now() then
    raise invalid_parameter_value using message = 'Invitation is no longer available';
  end if;

  if not invitation.account_existed_at_invitation then
    if canonical_full_name is null or canonical_full_name = '' then
      raise check_violation using message = 'Full name is required';
    end if;
    if length(canonical_full_name) > 120 then
      raise check_violation using message = 'Full name must be at most 120 characters';
    end if;
    if target_locale is null then
      raise invalid_parameter_value using message = 'Supported language required';
    end if;

    update public.profiles profile
    set
      full_name = canonical_full_name,
      preferred_locale = target_locale,
      last_active_company = invitation.company_id
    where profile.id = caller_id;
  else
    update public.profiles profile
    set last_active_company = invitation.company_id
    where profile.id = caller_id;
  end if;

  if not found then
    raise invalid_parameter_value using message = 'Invitation is no longer available';
  end if;

  insert into public.employee_memberships (
    company_id,
    profile_id,
    role,
    status
  )
  values (
    invitation.company_id,
    caller_id,
    invitation.role,
    'active'
  )
  on conflict (company_id, profile_id) do update
  set
    role = excluded.role,
    status = 'active';

  update public.employee_invitations candidate
  set
    accepted_at = now(),
    accepted_by_profile_id = caller_id
  where candidate.id = invitation.id;

  return invitation.company_id;
end;
$$;
