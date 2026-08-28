-- CLE-97. Re-inviting an address whose invitation had lapsed stamped `superseded_at` on the
-- old row and issued a new one. Four readers then described that same row four different ways:
--
--   `employee_invitation_states`      — 'expired'  (the owner's list)
--   `employee_invitation_preview`     — 'revoked'  (the invitee's page, before sign-in)
--   `get_employee_invitation_context` — 'expired'  (the invitee's page, after sign-in)
--   `accept_employee_invitation`      — refuses, on a mark neither reader mentioned
--
-- Both readings are wrong in the same way. 'Expired' tells an owner nobody acted, when they
-- themselves acted — they sent a newer invitation. 'Withdrawn' tells the invitee the company
-- changed its mind, when a fresh link is already in their inbox. The replacement is the fact,
-- and it is the only one that tells either side what to do next, so it becomes the state:
--
--   'replaced' — a newer invitation for this address took this one's place.
--
-- This revises the note CLE-91's migration left here, that superseded is "indistinguishable
-- from revoked" from the holder's side and that saying otherwise would invent a state the page
-- has to explain. The page does now explain it, because the explanation is the useful part.
-- Disclosure is unchanged: 'replaced' is returned by the same branch that already returned
-- 'revoked', still naming no company, no role and no address, and it separates two facts the
-- preview already distinguished from 'expired' and 'accepted'.
--
-- One expression, three readers. The copies were what let them drift, so the CASE moves into
-- a shared function and each reader calls it.

-- Ordering carries the fix as much as the name does. The replacement mark outranks the clock:
-- superseding only ever lands on an already-lapsed row today, so 'replaced' and 'expired'
-- coincide — but move a superseded row's expiry forward and the old ordering flipped the two
-- readers to 'pending' while `accept_employee_invitation` kept refusing. Reading the mark
-- first means no reader can promise what acceptance denies.
create function public.employee_invitation_lifecycle_state(
  accepted_at timestamptz,
  revoked_at timestamptz,
  superseded_at timestamptz,
  expires_at timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when accepted_at is not null then 'accepted'
    when revoked_at is not null then 'revoked'
    when superseded_at is not null then 'replaced'
    when expires_at <= now() then 'expired'
    else 'pending'
  end
$$;

comment on function public.employee_invitation_lifecycle_state(
  timestamptz, timestamptz, timestamptz, timestamptz
) is
  'The one lifecycle reading of an employee invitation, shared by the owner list, the invitee preview, the signed-in context, and the guards that refuse anything but ''pending''.';

revoke all on function public.employee_invitation_lifecycle_state(
  timestamptz, timestamptz, timestamptz, timestamptz
) from public, anon;
grant execute on function public.employee_invitation_lifecycle_state(
  timestamptz, timestamptz, timestamptz, timestamptz
) to authenticated, service_role;

-- The owner's list. Same columns in the same order, so the view is replaced in place and
-- keeps its grants and its `security_invoker` setting.
create or replace view public.employee_invitation_states
with (security_invoker = true)
as
select
  invitation.id,
  invitation.company_id,
  invitation.email,
  invitation.role,
  invitation.created_at,
  public.employee_invitation_lifecycle_state(
    invitation.accepted_at,
    invitation.revoked_at,
    invitation.superseded_at,
    invitation.expires_at
  ) as invitation_state
from public.employee_invitations invitation;

-- The invitee's page before anyone signs in. Return type is unchanged, so this is a redefinition.
create or replace function public.employee_invitation_preview(target_invitation_id uuid)
returns table (
  state text,
  company_name text,
  role public.employee_role,
  invitee_hint text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  invitation public.employee_invitations;
  invitation_state text;
begin
  select * into invitation
  from public.employee_invitations
  where id = target_invitation_id;

  -- An unknown id is a state, not an error: the page still has something to render, and a
  -- guess learns nothing a wrong guess would not.
  if not found then
    return query select 'unknown'::text, null::text, null::public.employee_role, null::text;
    return;
  end if;

  invitation_state := public.employee_invitation_lifecycle_state(
    invitation.accepted_at,
    invitation.revoked_at,
    invitation.superseded_at,
    invitation.expires_at
  );

  if invitation_state <> 'pending' then
    return query select
      invitation_state, null::text, null::public.employee_role, null::text;
    return;
  end if;

  return query
  select
    invitation_state,
    company.name,
    invitation.role,
    -- One leading character and a fixed mask: padding rather than truncating keeps the local
    -- part's length out of the answer.
    left(split_part(invitation.email, '@', 1), 1) || '***@'
      || split_part(invitation.email, '@', 2)
  from public.companies company
  where company.id = invitation.company_id;
end;
$$;

revoke all on function public.employee_invitation_preview(uuid) from public;
grant execute on function public.employee_invitation_preview(uuid)
  to anon, authenticated, service_role;

-- The invitee's page once signed in. It reported 'expired' for a replaced invitation and had
-- no branch for the mark at all.
create or replace function public.get_employee_invitation_context(
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
    profile.full_name,
    profile.preferred_locale,
    invitation.expires_at
  from public.employee_invitations invitation
  join caller on caller.email = invitation.email
  join public.profiles profile on profile.id = caller.id
  join public.companies company on company.id = invitation.company_id
  where invitation.id = target_invitation_id
$$;

revoke all on function public.get_employee_invitation_context(uuid) from public, anon;
grant execute on function public.get_employee_invitation_context(uuid)
to authenticated, service_role;

-- Withdrawal has to agree with what the list shows. It tested the clock and the two stamps but
-- not the replacement mark, so an owner could still revoke a row their list called 'replaced'
-- if its expiry had been moved forward. The guard is now the state itself: anything but
-- 'pending' is refused, which is the same rule `accept_employee_invitation` already applies.
create or replace function public.revoke_employee_invitation(
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

  if public.employee_invitation_lifecycle_state(
    invitation.accepted_at,
    invitation.revoked_at,
    invitation.superseded_at,
    invitation.expires_at
  ) <> 'pending' then
    raise invalid_parameter_value using message = 'Pending invitation required';
  end if;

  update public.employee_invitations candidate
  set revoked_at = now()
  where candidate.id = invitation.id;
end;
$$;

revoke all on function public.revoke_employee_invitation(uuid, uuid) from public, anon;
grant execute on function public.revoke_employee_invitation(uuid, uuid)
to authenticated, service_role;

comment on column public.employee_invitations.superseded_at is
  'When a newer invitation for the same company and address took this one''s place. Every reader calls that state ''replaced'', and it outranks expiry.';
