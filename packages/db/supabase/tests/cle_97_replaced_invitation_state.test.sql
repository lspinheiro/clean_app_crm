-- CLE-97 acceptance: a replaced invitation reads the same everywhere.
--
-- Re-inviting an address whose invitation has lapsed stamps `superseded_at` on the old row and
-- issues a new one. Four readers then described that same row four different ways:
--
--   `employee_invitation_states`      — "expired" (the owner's list)
--   `employee_invitation_preview`     — "revoked" (the invitee's page, before sign-in)
--   `get_employee_invitation_context` — "expired" (the invitee's page, after sign-in)
--   `accept_employee_invitation`      — refuses, on a mark neither reader mentioned
--
-- So an owner who re-invited saw a row claiming nobody had acted, while the invitee holding
-- the older link was told the company had withdrawn it. Both are wrong in the same way: the
-- replacement is the fact, and it is the only one that tells either side what to do next.
--
-- `replaced` is now that state, produced for all three readers by one shared expression, and
-- it is ordered ahead of expiry so the reading cannot drift back apart if a row's expiry is
-- later moved.
begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_function(
  'public',
  'employee_invitation_lifecycle_state',
  array['timestamptz', 'timestamptz', 'timestamptz', 'timestamptz'],
  'the three readers share one lifecycle expression rather than three copies of it'
);

-- ---------------------------------------------------------------------------
-- Fixtures: one company, one owner, one invitee, and an address invited twice
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, abn, status)
values (
  '97000000-0000-4000-8000-000000000010',
  'CLE-97 Replacement Company',
  '97000000001',
  'approved'
);

-- The profile trigger fires off auth.users, so both people start there.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  (
    '97000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'owner@cle97.test',
    extensions.crypt('local-test-only', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    pg_catalog.jsonb_build_object('full_name', 'CLE-97 Owner'),
    now(), now(), '', '', '', ''
  ),
  (
    '97000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'invitee@cle97.test',
    extensions.crypt('local-test-only', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    pg_catalog.jsonb_build_object('full_name', 'CLE-97 Invitee'),
    now(), now(), '', '', '', ''
  );

insert into public.employee_memberships (id, company_id, profile_id, role, status)
values (
  '97000000-0000-4000-8000-000000000091',
  '97000000-0000-4000-8000-000000000010',
  '97000000-0000-4000-8000-000000000001',
  'owner',
  'active'
);

-- The lapsed invitation. `prepare_employee_invitation` stamps `superseded_at` on exactly this
-- shape, so the fixture writes the same end state rather than re-deriving it.
insert into public.employee_invitations (
  id, company_id, email, role, locale, invited_by_profile_id,
  account_existed_at_invitation, expires_at, superseded_at
) values (
  '97000000-0000-4000-8000-000000000301',
  '97000000-0000-4000-8000-000000000010',
  'invitee@cle97.test', 'staff', 'en-AU',
  '97000000-0000-4000-8000-000000000001',
  true, now() - interval '1 day', now()
);

-- The invitation that replaced it, still live.
insert into public.employee_invitations (
  id, company_id, email, role, locale, invited_by_profile_id,
  account_existed_at_invitation, expires_at
) values (
  '97000000-0000-4000-8000-000000000302',
  '97000000-0000-4000-8000-000000000010',
  'invitee@cle97.test', 'staff', 'en-AU',
  '97000000-0000-4000-8000-000000000001',
  true, now() + interval '7 days'
);

-- ---------------------------------------------------------------------------
-- The owner's list
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select invitation_state::text collate "C"
      from public.employee_invitation_states
      where id = '97000000-0000-4000-8000-000000000301'$$,
  $$values ('replaced'::text collate "C")$$,
  'the owner sees the superseded row as replaced, not as one nobody acted on'
);

select results_eq(
  $$select invitation_state::text collate "C"
      from public.employee_invitation_states
      where id = '97000000-0000-4000-8000-000000000302'$$,
  $$values ('pending'::text collate "C")$$,
  'the invitation that replaced it stays pending'
);

-- ---------------------------------------------------------------------------
-- The invitee's page, before anyone signs in
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select results_eq(
  $$select state, company_name, invitee_hint
      from public.employee_invitation_preview(
        '97000000-0000-4000-8000-000000000301'
      )$$,
  $$values ('replaced'::text, null::text, null::text)$$,
  'the holder of the older link is told it was replaced, and still learns no tenant'
);

select results_eq(
  $$select state
      from public.employee_invitation_preview(
        '97000000-0000-4000-8000-000000000302'
      )$$,
  $$values ('pending'::text)$$,
  'the replacement previews as usable'
);

-- ---------------------------------------------------------------------------
-- The invitee's page, once signed in
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select invitation_status::text collate "C"
      from public.get_employee_invitation_context(
        '97000000-0000-4000-8000-000000000301'
      )$$,
  $$values ('replaced'::text collate "C")$$,
  'the signed-in invitee reads the same word the owner does'
);

select results_eq(
  $$select invitation_status::text collate "C"
      from public.get_employee_invitation_context(
        '97000000-0000-4000-8000-000000000302'
      )$$,
  $$values ('pending'::text collate "C")$$,
  'the replacement is the one the acceptance form is offered for'
);

-- ---------------------------------------------------------------------------
-- Acceptance agrees with what all three showed
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.accept_employee_invitation(
      '97000000-0000-4000-8000-000000000301',
      'CLE-97 Invitee',
      'en-AU'
    )$$,
  '22023',
  'Invitation is no longer available',
  'a replaced invitation cannot be accepted, which is what all three readers implied'
);

-- ---------------------------------------------------------------------------
-- The mark outranks the clock, so the four readers cannot drift apart again
--
-- Superseding only ever lands on a lapsed row, so today "replaced" and "expired" happen to
-- coincide. Moving the expiry forward separates them: the old ordering flipped the two
-- readers back to "pending" while acceptance kept refusing.
-- ---------------------------------------------------------------------------

reset role;
update public.employee_invitations
set expires_at = now() + interval '7 days'
where id = '97000000-0000-4000-8000-000000000301';

set local role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select invitation_state::text collate "C"
      from public.employee_invitation_states
      where id = '97000000-0000-4000-8000-000000000301'$$,
  $$values ('replaced'::text collate "C")$$,
  'the owner list still reads replaced once the expiry is moved forward'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select results_eq(
  $$select state, company_name
      from public.employee_invitation_preview(
        '97000000-0000-4000-8000-000000000301'
      )$$,
  $$values ('replaced'::text, null::text)$$,
  'the preview still reads replaced, and does not start naming the company again'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select invitation_status::text collate "C"
      from public.get_employee_invitation_context(
        '97000000-0000-4000-8000-000000000301'
      )$$,
  $$values ('replaced'::text collate "C")$$,
  'the signed-in reader still reads replaced'
);

select throws_ok(
  $$select public.accept_employee_invitation(
      '97000000-0000-4000-8000-000000000301',
      'CLE-97 Invitee',
      'en-AU'
    )$$,
  '22023',
  'Invitation is no longer available',
  'and acceptance still refuses, so no reader promises what the RPC denies'
);

-- An owner cannot withdraw what they already replaced: the list offers no action on a
-- replaced row, and the RPC behind it agrees.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.revoke_employee_invitation(
      '97000000-0000-4000-8000-000000000301',
      '97000000-0000-4000-8000-000000000010'
    )$$,
  '22023',
  'Pending invitation required',
  'revoking a replaced invitation is refused rather than silently stamping it'
);

select * from finish();

rollback;
