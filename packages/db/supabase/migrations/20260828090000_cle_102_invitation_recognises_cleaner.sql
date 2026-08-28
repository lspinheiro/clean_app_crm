-- CLE-102: the signed-in invitee's context says whether they already clean for this company.
--
-- One person can hold both relationships with the same company under one sign-in address: a
-- cleaner membership (`company_members`, the legacy pool name the schema keeps) and an
-- employee membership carrying `owner` or `staff`. Inviting a cleaner onto the office side is
-- therefore an ordinary thing for a company to do, and acceptance already handles it —
-- `accept_employee_invitation` writes only the employee membership and never touches the
-- cleaner one.
--
-- What was missing was saying so. `get_employee_invitation_context` described the invitation
-- and never the person, so the accept page could only offer a generic join, and somebody who
-- already cleans for the company had no way to tell whether accepting added a role to the
-- account they have or started a second, separate one.
--
-- The column is a fact about the caller, not about the invitation: it is computed against
-- `auth.uid()`'s own membership at the inviting company. This function is security definer, so
-- it reads `company_members` past RLS — joining through `caller` is what keeps that from
-- becoming a way to ask about anybody else. Nothing is added to
-- `employee_invitation_preview`: that one answers without a session and is reachable by
-- anyone holding the link, so it must not disclose who cleans here.
--
-- The return type gains a column, so this is a drop and create rather than a redefinition.
drop function public.get_employee_invitation_context(uuid);

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
  cleaner_membership_active boolean,
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
    public.employee_invitation_lifecycle_state(
      invitation.accepted_at,
      invitation.revoked_at,
      invitation.superseded_at,
      invitation.expires_at
    ),
    invitation.email,
    company.name,
    invitation.role,
    invitation.locale,
    invitation.account_existed_at_invitation,
    exists (
      select 1
      from public.company_members cleaner_membership
      where cleaner_membership.profile_id = caller.id
        and cleaner_membership.company_id = invitation.company_id
        and cleaner_membership.status = 'active'
    ),
    profile.full_name,
    profile.preferred_locale,
    invitation.expires_at
  from public.employee_invitations invitation
  join caller on caller.email = invitation.email
  join public.profiles profile on profile.id = caller.id
  join public.companies company on company.id = invitation.company_id
  where invitation.id = target_invitation_id
$$;

comment on function public.get_employee_invitation_context(uuid) is
  'The invitee''s own view of an employee invitation once signed in, including whether they already hold an active cleaner membership with the inviting company.';

revoke all on function public.get_employee_invitation_context(uuid) from public, anon;
grant execute on function public.get_employee_invitation_context(uuid)
to authenticated, service_role;
