-- CLE-98. The duplicate-employee refusal asked the wrong address.
--
-- `public.profiles.email` is a copy, written once by `handle_new_auth_user`, which fires only
-- `after insert on auth.users`. Nothing refreshes it, so from the moment someone changes their
-- address the stored copy records who they used to be. Every other check in this flow already
-- reads `auth.users`: delivery and the usable-login rule (CLE-94), the invitation preview, the
-- link claim, and acceptance, which matches an invitation to the caller by their live address.
-- This one check read the copy, and so answered about an address nobody is using — wrongly in
-- both directions:
--
--   * the address an active employee actually signs in with was not recognised, so an owner
--     could mint a second offer to somebody already on their team;
--   * the address that employee had given up was refused as "already an employee", blocking an
--     invitation to an address that now belongs to nobody, or to an unrelated person.
--
-- The membership already points at the identity — `employee_memberships.profile_id` is the
-- `auth.users` id, since `public.profiles.id` references it — so the fix is to join through to
-- the live record instead of the copy. Nothing about the signature or the return type changes,
-- so the function is replaced in place.
create or replace function public.prepare_employee_invitation(
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

  -- The live address, not the copy beside the profile. The scope is unchanged: only an active
  -- membership at this company blocks the offer.
  if exists (
    select 1
    from public.employee_memberships membership
    join auth.users auth_user on auth_user.id = membership.profile_id
    where membership.company_id = target_company_id
      and membership.status = 'active'
      and lower(btrim(auth_user.email)) = canonical_email
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
