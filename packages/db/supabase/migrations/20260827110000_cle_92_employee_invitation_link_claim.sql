-- CLE-92. The invitation record lives seven days; the auth token in the e-mail is single-use
-- and dies on the first GET. A link scanner, a browser prefetch or a reload spends it, and
-- until now that ended the journey: `prepare_employee_invitation` refuses while an invitation
-- is open, so the only recourse was revoke-and-reinvite, which mints a new id and silently
-- orphans the link already sitting in the invitee's inbox.
--
-- Claiming re-sends the invitation that already exists. The seven-day record becomes usable
-- for seven days.

alter table public.employee_invitations
  add column last_link_sent_at timestamptz;

comment on column public.employee_invitations.last_link_sent_at is
  'When a fresh auth link was last issued for this invitation. Bounds self-service re-sends.';

-- One statement, so two taps cannot both send: the row is the lock. The sixty-second floor is
-- the project's own `smtp_max_frequency`, applied here rather than trusted to the caller —
-- the caller is an unauthenticated page.
--
-- A refusal returns a row with `claimed = false` and no address. Distinguishing "revoked"
-- from "too soon" here would tell whoever holds a link id which invitations are live and let
-- them time the answers; the page already reads that from the preview, which is masked.
create function public.claim_employee_invitation_link(target_invitation_id uuid)
returns table (
  claimed boolean,
  invitee_email text,
  locale public.app_locale,
  account_confirmed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_invitation public.employee_invitations;
begin
  update public.employee_invitations invitation
  set last_link_sent_at = now()
  where invitation.id = target_invitation_id
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.superseded_at is null
    and invitation.expires_at > now()
    and (
      invitation.last_link_sent_at is null
      or invitation.last_link_sent_at <= now() - interval '60 seconds'
    )
  returning invitation.* into claimed_invitation;

  if not found then
    return query select false, null::text, null::public.app_locale, null::boolean;
    return;
  end if;

  -- Which e-mail to send: an unconfirmed account is re-invited, a confirmed one is recovered,
  -- the branch `invite-first-admin.mjs` already makes. Returning it here keeps the caller from
  -- discovering it by attempting a send and failing.
  return query
  select
    true,
    claimed_invitation.email,
    claimed_invitation.locale,
    exists (
      select 1 from auth.users auth_user
      where lower(btrim(auth_user.email)) = claimed_invitation.email
        and auth_user.email_confirmed_at is not null
    );
end;
$$;

-- Only the server action, which holds the service key, may make the project send e-mail. An
-- `anon` grant would let anyone holding a link id drain the account's e-mail allowance, and
-- that allowance is shared with every other auth e-mail the product sends.
revoke all on function public.claim_employee_invitation_link(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_employee_invitation_link(uuid) to service_role;
