-- CLE-91. `get_employee_invitation_context` requires a confirmed session whose e-mail matches
-- the invitation and returns zero rows otherwise, so "not signed in", "signed in as somebody
-- else", "revoked" and "expired" are one indistinguishable empty result. The acceptance page
-- therefore shows a single unactionable message for all of them, and tells a brand-new invitee
-- to sign in to an account they have never created — the CRM has no sign-up, no magic link and
-- no password reset, so that is a dead end.
--
-- This is the missing primitive: enough to route the page before anyone is signed in.
--
-- Disclosure follows `cleaner_invite_preview` and the rule its entropy migration set
-- (20260822091000): the state is always readable, the tenant is named only for an invitation
-- that can still be used, so a spent or revoked link discloses no company. The id is a
-- `gen_random_uuid()` — 122 bits, well past the 2^80 bar that migration argued for — and every
-- fact returned for a live invitation was already in the e-mail the holder received.
--
-- The invitee's address is masked even then. Unlike the cleaner's invite code, holding this id
-- does not prove you are the invitee: the admin has it too, and it travels in a forwardable
-- e-mail. The hint exists so somebody can recognise their own address, not collect another's.
create function public.employee_invitation_preview(target_invitation_id uuid)
returns table (
  state text,
  company_name text,
  role public.employee_role,
  account_existed boolean,
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
    return query select
      'unknown'::text, null::text, null::public.employee_role, null::boolean, null::text;
    return;
  end if;

  invitation_state := case
    when invitation.accepted_at is not null then 'accepted'
    -- Superseded means a newer invitation replaced this one; from the holder's side that is
    -- indistinguishable from revoked, and saying so avoids inventing a state the page would
    -- have to explain.
    when invitation.revoked_at is not null or invitation.superseded_at is not null then 'revoked'
    when invitation.expires_at <= now() then 'expired'
    else 'pending'
  end;

  if invitation_state <> 'pending' then
    return query select
      invitation_state, null::text, null::public.employee_role, null::boolean, null::text;
    return;
  end if;

  return query
  select
    invitation_state,
    company.name,
    invitation.role,
    invitation.account_existed_at_invitation,
    -- One leading character and a fixed mask: padding rather than truncating keeps the local
    -- part's length out of the answer.
    left(split_part(invitation.email, '@', 1), 1) || '***@'
      || split_part(invitation.email, '@', 2)
  from public.companies company
  where company.id = invitation.company_id;
end;
$$;

-- Readable without a session, by design. Nothing else about employee invitations opens up:
-- the table stays revoked from anon, and `get_employee_invitation_context` stays authenticated.
revoke all on function public.employee_invitation_preview(uuid) from public;
grant execute on function public.employee_invitation_preview(uuid)
  to anon, authenticated, service_role;
