-- CLE-92 review follow-up. `claim_employee_invitation_link` writes `last_link_sent_at` before
-- any provider call, because the row is the lock that stops two taps both sending. That
-- conflates "we accepted the request" with "the provider accepted the message": when a send
-- was rejected, the invitee was told a link was on the way, given no retry, and blocked for
-- sixty seconds by an e-mail that never left the building.
--
-- Releasing separates the two. The claim still reserves the minute for the duration of the
-- send, so the race the lock exists for is unaffected; only a send that definitely failed
-- gives the reservation back.
--
-- Nothing here reveals whether an address exists — the caller is `service_role`, and the
-- public response stays the same either way.
create function public.release_employee_invitation_link_claim(target_invitation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.employee_invitations
  set last_link_sent_at = null
  where id = target_invitation_id
    and accepted_at is null
    and revoked_at is null
    and superseded_at is null;
$$;

revoke all on function public.release_employee_invitation_link_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.release_employee_invitation_link_claim(uuid) to service_role;
