create table public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null
    check (
      email = lower(btrim(email))
      and length(email) <= 320
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ),
  role public.employee_role not null,
  locale public.app_locale not null,
  invited_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  account_existed_at_invitation boolean not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  superseded_at timestamptz,
  accepted_by_profile_id uuid references public.profiles (id) on delete restrict,
  check (not (accepted_at is not null and revoked_at is not null)),
  check (
    (accepted_at is null and accepted_by_profile_id is null)
    or (accepted_at is not null and accepted_by_profile_id is not null)
  )
);

create unique index employee_invitations_one_open_company_email_idx
on public.employee_invitations (company_id, email)
where accepted_at is null
  and revoked_at is null
  and superseded_at is null;

create index employee_invitations_company_created_idx
on public.employee_invitations (company_id, created_at desc);

create index employee_invitations_email_created_idx
on public.employee_invitations (email, created_at desc);

alter table public.employee_invitations enable row level security;

revoke all on table public.employee_invitations from anon, authenticated;
grant select on table public.employee_invitations to authenticated;
grant all on table public.employee_invitations to service_role;

create policy employee_invitations_select_owner
on public.employee_invitations
for select
to authenticated
using (public.is_company_owner(company_id));

create view public.employee_invitation_states
with (security_invoker = true)
as
select
  invitation.id,
  invitation.company_id,
  invitation.email,
  invitation.role,
  invitation.created_at,
  case
    when invitation.accepted_at is not null then 'accepted'
    when invitation.revoked_at is not null then 'revoked'
    when invitation.expires_at <= now() then 'expired'
    else 'pending'
  end as invitation_state
from public.employee_invitations invitation;

revoke all on table public.employee_invitation_states from public, anon, authenticated;
grant select on table public.employee_invitation_states to authenticated, service_role;

create function public.prepare_employee_invitation(
  target_company_id uuid,
  target_email text,
  target_role public.employee_role,
  target_locale public.app_locale
)
returns table (
  invitation_id uuid,
  invitation_expires_at timestamptz,
  account_existed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  canonical_email text := lower(btrim(target_email));
begin
  if caller_id is null or not public.is_company_owner(target_company_id) then
    raise insufficient_privilege using message = 'Company owner access required';
  end if;

  if canonical_email is null
    or canonical_email = ''
    or length(canonical_email) > 320
    or canonical_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise invalid_parameter_value using message = 'A valid invitee e-mail is required';
  end if;

  if target_role is null then
    raise invalid_parameter_value using message = 'Employee role required';
  end if;

  if target_locale is null then
    raise invalid_parameter_value using message = 'Supported language required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_company_id::text || ':' || canonical_email, 0)
  );

  update public.employee_invitations invitation
  set superseded_at = now()
  where invitation.company_id = target_company_id
    and invitation.email = canonical_email
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.superseded_at is null
    and invitation.expires_at <= now();

  if exists (
    select 1
    from public.employee_invitations invitation
    where invitation.company_id = target_company_id
      and invitation.email = canonical_email
      and invitation.accepted_at is null
      and invitation.revoked_at is null
      and invitation.superseded_at is null
  ) then
    raise unique_violation using message = 'An open invitation already exists for this e-mail';
  end if;

  if exists (
    select 1
    from public.employee_memberships membership
    join public.profiles profile on profile.id = membership.profile_id
    where membership.company_id = target_company_id
      and membership.status = 'active'
      and lower(btrim(profile.email)) = canonical_email
  ) then
    raise unique_violation using message = 'This account is already an employee';
  end if;

  select exists (
    select 1
    from auth.users auth_user
    where lower(btrim(auth_user.email)) = canonical_email
      and auth_user.email_confirmed_at is not null
  ) into account_existed;

  insert into public.employee_invitations (
    company_id,
    email,
    role,
    locale,
    invited_by_profile_id,
    account_existed_at_invitation,
    expires_at
  )
  values (
    target_company_id,
    canonical_email,
    target_role,
    target_locale,
    caller_id,
    account_existed,
    now() + interval '7 days'
  )
  returning id, expires_at
  into invitation_id, invitation_expires_at;

  return next;
end;
$$;

create function public.get_employee_invitation_context(
  target_invitation_id uuid
)
returns table (
  invitation_id uuid,
  invitation_status text,
  invitee_email text,
  company_name text,
  role public.employee_role,
  locale public.app_locale,
  account_existed_at_invitation boolean,
  profile_full_name text,
  profile_locale public.app_locale,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select
      auth_user.id,
      lower(btrim(auth_user.email)) as email
    from auth.users auth_user
    where auth_user.id = auth.uid()
      and auth_user.email_confirmed_at is not null
      and auth_user.email is not null
  )
  select
    invitation.id,
    case
      when invitation.accepted_at is not null then 'accepted'
      when invitation.revoked_at is not null then 'revoked'
      when invitation.expires_at <= now() then 'expired'
      else 'pending'
    end,
    invitation.email,
    company.name,
    invitation.role,
    invitation.locale,
    invitation.account_existed_at_invitation,
    profile.full_name,
    profile.preferred_locale,
    invitation.expires_at
  from public.employee_invitations invitation
  join caller on caller.email = invitation.email
  join public.profiles profile on profile.id = caller.id
  join public.companies company on company.id = invitation.company_id
  where invitation.id = target_invitation_id
$$;

create function public.accept_employee_invitation(
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
  );

  update public.employee_invitations candidate
  set
    accepted_at = now(),
    accepted_by_profile_id = caller_id
  where candidate.id = invitation.id;

  return invitation.company_id;
end;
$$;

create function public.revoke_employee_invitation(
  target_invitation_id uuid,
  target_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.employee_invitations;
begin
  select candidate.*
  into invitation
  from public.employee_invitations candidate
  where candidate.id = target_invitation_id
    and candidate.company_id = target_company_id
  for update;

  if invitation.id is null or not public.is_company_owner(invitation.company_id) then
    raise insufficient_privilege using message = 'Company owner access required';
  end if;

  if invitation.accepted_at is not null
    or invitation.revoked_at is not null
    or invitation.expires_at <= now() then
    raise invalid_parameter_value using message = 'Pending invitation required';
  end if;

  update public.employee_invitations candidate
  set revoked_at = now()
  where candidate.id = invitation.id;
end;
$$;

revoke all on function public.prepare_employee_invitation(
  uuid,
  text,
  public.employee_role,
  public.app_locale
) from public, anon;
revoke all on function public.get_employee_invitation_context(uuid)
from public, anon;
revoke all on function public.accept_employee_invitation(
  uuid,
  text,
  public.app_locale
) from public, anon;
revoke all on function public.revoke_employee_invitation(uuid, uuid)
from public, anon;

grant execute on function public.prepare_employee_invitation(
  uuid,
  text,
  public.employee_role,
  public.app_locale
) to authenticated, service_role;
grant execute on function public.get_employee_invitation_context(uuid)
to authenticated, service_role;
grant execute on function public.accept_employee_invitation(
  uuid,
  text,
  public.app_locale
) to authenticated, service_role;
grant execute on function public.revoke_employee_invitation(uuid, uuid)
to authenticated, service_role;
