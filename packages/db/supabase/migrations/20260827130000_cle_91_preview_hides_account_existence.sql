-- CLE-91 review follow-up. The anonymous preview reported `account_existed`, and the
-- acceptance page turned that bit into visibly different journeys — "sign in" for an address
-- that already had an account, "your link was used" for one that did not. Anyone holding the
-- invitation id could therefore test whether a colleague has a Clean Crew login.
--
-- The id does not prove the holder is the invitee: the admin has it too, and it travels in a
-- forwardable e-mail. That is the same reasoning that masks the address here, and it applies
-- just as well to account existence. OWASP's authentication guidance is to keep sign-in and
-- recovery responses consistent rather than confirming an account exists.
--
-- The server still needs the answer to choose between re-inviting and sending a recovery
-- e-mail. `claim_employee_invitation_link` reports it to `service_role` alone, which is where
-- that decision belongs.
--
-- The return type changes, so the function is replaced rather than redefined.
drop function if exists public.employee_invitation_preview(uuid);

create function public.employee_invitation_preview(target_invitation_id uuid)
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
