-- CLE-100. The invitation e-mail named the company and nobody else. In an inbox the sender is
-- the strongest signal there is, and it is the person the invitee recognises: someone who has
-- never heard a trading name has heard of the owner who told them an invitation was coming.
--
-- Two of the three e-mails have both facts in hand already, because the owner's own session is
-- what raised them. The third does not. The invitee asks for a fresh link from a page with no
-- session at all, which is why that path sent `company_name: ''` and the invitation arrived as
-- "Join the  team". The invitation row records the company and the inviter, so delivery reads
-- them from there.
--
-- The invitee's auth record comes back with them, because a recovery e-mail carries no per-send
-- payload: `resetPasswordForEmail` takes a redirect and nothing else, and its template reads
-- `.Data`, which is the account's own metadata. Naming the company and the inviter there means
-- writing them onto the account first, and that needs the account's id.
create function public.employee_invitation_delivery_details(target_invitation_id uuid)
returns table (
  company_name text,
  inviter_name text,
  invitee_user_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    company.name,
    inviter.full_name,
    (
      select auth_user.id
      from auth.users auth_user
      where lower(btrim(auth_user.email)) = invitation.email
      -- The live address, as every other check in this flow reads it. Ordered so that the
      -- answer cannot vary between calls; an invitation of ours creates at most one record.
      order by auth_user.created_at
      limit 1
    )
  from public.employee_invitations invitation
  join public.companies company on company.id = invitation.company_id
  join public.profiles inviter on inviter.id = invitation.invited_by_profile_id
  where invitation.id = target_invitation_id
$$;

-- Only the server action, which holds the service key, may ask. The answer includes whether an
-- address has an auth record — the question the invitation preview is deliberately masked to
-- avoid answering — so this stays shut to `anon` and to arbitrary signed-in accounts alike.
revoke all on function public.employee_invitation_delivery_details(uuid)
  from public, anon, authenticated;
grant execute on function public.employee_invitation_delivery_details(uuid) to service_role;
