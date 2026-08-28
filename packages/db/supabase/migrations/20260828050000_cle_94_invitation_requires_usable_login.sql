-- CLE-94. `account_existed` meant nothing more than `email_confirmed_at is not null`, and both
-- the delivery branch and the acceptance form read it as "this person can sign in". They
-- cannot. Following an invite link confirms the address, and an e-mail scanner following it for
-- the invitee does the same, but the password is only ever set inside acceptance.
--
-- Decision 24's amendment already rejected that premise and fixed
-- `claim_employee_invitation_link`. It was left standing here, so an invitee whose address had
-- been confirmed but who had never chosen a password was sent "Sign in and accept the
-- invitation" — to a login that does not exist. Worse, the acceptance form reads the same flag
-- to decide whether to ask for a password, so fighting through by other means produced a member
-- who could use one session and was locked out when it expired.
--
-- Two facts are needed, and they are not the same fact:
--
--   `account_existed`   — there is a usable login: confirmed AND a password is set. This is the
--                         one the acceptance form wants; false means "ask for a password".
--   `auth_user_exists`  — some auth record exists under this address, with or without a
--                         password. This is the one delivery wants: `inviteUserByEmail` is
--                         refused for an address that is already registered, so an account
--                         without a password has to be reached by recovery instead.
--
-- The return type changes, so the function is replaced rather than redefined.
drop function if exists public.prepare_employee_invitation(
  uuid,
  text,
  public.employee_role,
  public.app_locale
);

create function public.prepare_employee_invitation(
  target_company_id uuid,
  target_email text,
  target_role public.employee_role,
  target_locale public.app_locale
)
returns table (
  invitation_id uuid,
  invitation_expires_at timestamptz,
  account_existed boolean,
  auth_user_exists boolean
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

  select
    exists (
      select 1
      from auth.users auth_user
      where lower(btrim(auth_user.email)) = canonical_email
        and auth_user.email_confirmed_at is not null
        -- GoTrue leaves this empty rather than null for an account created by invitation, so
        -- both spellings of "no password" have to count as one.
        and auth_user.encrypted_password is not null
        and auth_user.encrypted_password <> ''
    ),
    exists (
      select 1
      from auth.users auth_user
      where lower(btrim(auth_user.email)) = canonical_email
    )
  into account_existed, auth_user_exists;

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

revoke all on function public.prepare_employee_invitation(
  uuid,
  text,
  public.employee_role,
  public.app_locale
) from public, anon;
grant execute on function public.prepare_employee_invitation(
  uuid,
  text,
  public.employee_role,
  public.app_locale
) to authenticated, service_role;

comment on column public.employee_invitations.account_existed_at_invitation is
  'Whether the invitee already had a usable login — confirmed and holding a password — when the invitation was created. False means acceptance must set one.';

-- An invitation already in flight carries the old meaning, so its acceptance form would still
-- skip the password. Only invitations nobody has accepted are touched; an accepted one is
-- history and its flag records what was true at the time.
update public.employee_invitations invitation
set account_existed_at_invitation = exists (
  select 1
  from auth.users auth_user
  where lower(btrim(auth_user.email)) = invitation.email
    and auth_user.email_confirmed_at is not null
    and auth_user.encrypted_password is not null
    and auth_user.encrypted_password <> ''
)
where invitation.accepted_at is null;
