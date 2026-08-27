-- CLE-91 acceptance: an employee invitation can be read before anyone is signed in.
--
-- `get_employee_invitation_context` needs a confirmed session whose e-mail matches the
-- invitation, and returns zero rows otherwise. Not-signed-in, wrong-account, revoked and
-- expired therefore collapse into one empty result, which is why the acceptance page shows
-- a single unactionable message for all of them — and why a brand-new invitee is told to
-- sign in to an account they have never created.
--
-- This preview is the missing primitive. It follows `cleaner_invite_preview` and the
-- disclosure rule its entropy migration set: the state is always readable, the tenant is
-- named only for an invitation that can still be used. The invitee's address is masked in
-- every case — unlike the cleaner's invite code, the id does not prove you are the invitee,
-- only that you hold the link.
begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

-- ---------------------------------------------------------------------------
-- Shape and reach
-- ---------------------------------------------------------------------------

select has_function(
  'public',
  'employee_invitation_preview',
  array['uuid'],
  'an invitation can be described before the invitee has a session'
);

select is_definer(
  'public',
  'employee_invitation_preview',
  array['uuid'],
  'the preview reads with its owner''s rights, because the caller has none'
);

select ok(
  has_function_privilege(
    'anon',
    'public.employee_invitation_preview(uuid)',
    'EXECUTE'
  ),
  'a visitor with the link but no account can read the invitation'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.employee_invitation_preview(uuid)',
    'EXECUTE'
  ),
  'a signed-in visitor can read it too, whoever they are'
);

-- ---------------------------------------------------------------------------
-- Fixtures: one company and four invitations, one per lifecycle state
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, abn, status)
values (
  '91000000-0000-4000-8000-000000000010',
  'CLE-91 Preview Company',
  '91000000001',
  'approved'
);

-- The profile trigger fires off auth.users, so the owner starts there — same preamble the
-- CLE-83 suite uses.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values (
  '91000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'owner@cle91.test',
  extensions.crypt('local-test-only', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  pg_catalog.jsonb_build_object('full_name', 'CLE-91 Owner'),
  now(), now(), '', '', '', ''
);

insert into public.employee_memberships (id, company_id, profile_id, role, status)
values (
  '91000000-0000-4000-8000-000000000091',
  '91000000-0000-4000-8000-000000000010',
  '91000000-0000-4000-8000-000000000001',
  'owner',
  'active'
);

insert into public.employee_invitations (
  id, company_id, email, role, locale, invited_by_profile_id,
  account_existed_at_invitation, expires_at, accepted_at, accepted_by_profile_id, revoked_at
) values
  (
    '91000000-0000-4000-8000-000000000201',
    '91000000-0000-4000-8000-000000000010',
    'pending.invitee@cle91.test', 'staff', 'en-AU',
    '91000000-0000-4000-8000-000000000001',
    false, now() + interval '7 days', null, null, null
  ),
  (
    '91000000-0000-4000-8000-000000000202',
    '91000000-0000-4000-8000-000000000010',
    'expired.invitee@cle91.test', 'staff', 'en-AU',
    '91000000-0000-4000-8000-000000000001',
    false, now() - interval '1 day', null, null, null
  ),
  (
    '91000000-0000-4000-8000-000000000203',
    '91000000-0000-4000-8000-000000000010',
    'revoked.invitee@cle91.test', 'owner', 'pt-BR',
    '91000000-0000-4000-8000-000000000001',
    true, now() + interval '7 days', null, null, now()
  ),
  (
    '91000000-0000-4000-8000-000000000204',
    '91000000-0000-4000-8000-000000000010',
    'accepted.invitee@cle91.test', 'staff', 'en-AU',
    '91000000-0000-4000-8000-000000000001',
    false, now() + interval '7 days', now(),
    '91000000-0000-4000-8000-000000000001', null
  );

-- The preview is the only cleaner-side read that must work with no session at all, so it is
-- exercised as `anon` rather than as the fixture writer.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

-- ---------------------------------------------------------------------------
-- A live invitation names itself
-- ---------------------------------------------------------------------------

select results_eq(
  $$select state, company_name, role::text
      from public.employee_invitation_preview(
        '91000000-0000-4000-8000-000000000201'
      )$$,
  $$values ('pending'::text, 'CLE-91 Preview Company'::text, 'staff'::text)$$,
  'a live invitation names the company and the role'
);

-- Whether an address already has an account is not the holder's business. The id is held by
-- the admin too and travels in a forwardable e-mail, so reflecting account existence would
-- let anyone holding a link test whether a colleague has a Clean Crew login. The server
-- still needs the answer to choose which e-mail to send; it just does not say so out loud.
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc proc
    cross join lateral pg_catalog.unnest(proc.proargnames) as argument(name)
    where proc.proname = 'employee_invitation_preview'
      and proc.pronamespace = 'public'::regnamespace
      and argument.name = 'account_existed'
  ),
  0,
  'the anonymous preview does not disclose whether the invitee already had an account'
);

select is(
  (
    select invitee_hint
    from public.employee_invitation_preview('91000000-0000-4000-8000-000000000201')
  ),
  'p***@cle91.test',
  'the invitee is identified well enough to recognise, not well enough to harvest'
);

select is(
  (
    select count(*)::integer
    from public.employee_invitation_preview('91000000-0000-4000-8000-000000000201') preview
    where preview.invitee_hint like '%pending.invitee%'
  ),
  0,
  'the plain address never leaves the database'
);

-- ---------------------------------------------------------------------------
-- Everything that cannot be used discloses nothing about the tenant
-- ---------------------------------------------------------------------------

select results_eq(
  $$select state, company_name, invitee_hint
      from public.employee_invitation_preview(
        '91000000-0000-4000-8000-000000000202'
      )$$,
  $$values ('expired'::text, null::text, null::text)$$,
  'an expired invitation reports only that it expired'
);

select results_eq(
  $$select state, company_name, invitee_hint
      from public.employee_invitation_preview(
        '91000000-0000-4000-8000-000000000203'
      )$$,
  $$values ('revoked'::text, null::text, null::text)$$,
  'a revoked invitation never names the company it belonged to'
);

select results_eq(
  $$select state, company_name, invitee_hint
      from public.employee_invitation_preview(
        '91000000-0000-4000-8000-000000000204'
      )$$,
  $$values ('accepted'::text, null::text, null::text)$$,
  'an accepted invitation says so, so the page can send them to sign in'
);

select results_eq(
  $$select state, company_name, invitee_hint
      from public.employee_invitation_preview(
        '91000000-0000-4000-8000-0000000009ff'
      )$$,
  $$values ('unknown'::text, null::text, null::text)$$,
  'an id that matches nothing is a state, not an error'
);

select is(
  (
    select count(*)::integer
    from public.employee_invitation_preview('91000000-0000-4000-8000-0000000009ff')
  ),
  1,
  'every call answers with exactly one row, so the page always has a state to render'
);

-- ---------------------------------------------------------------------------
-- The preview widens nothing else
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select id from public.employee_invitations
     where id = '91000000-0000-4000-8000-000000000201'$$,
  '42501',
  null,
  'the preview does not give an anonymous caller the invitations table'
);

select is(
  (
    select count(*)::integer
    from public.employee_invitation_preview('91000000-0000-4000-8000-000000000201') preview
    where preview.state = 'pending'
  ),
  1,
  'an anonymous caller still reads a live invitation after the table refusal'
);

reset role;

-- ---------------------------------------------------------------------------
-- Masking holds for addresses that would otherwise leak through their shape
-- ---------------------------------------------------------------------------

insert into public.employee_invitations (
  id, company_id, email, role, locale, invited_by_profile_id,
  account_existed_at_invitation, expires_at
) values
  (
    '91000000-0000-4000-8000-000000000205',
    '91000000-0000-4000-8000-000000000010',
    'a@cle91.test', 'staff', 'en-AU',
    '91000000-0000-4000-8000-000000000001',
    false, now() + interval '7 days'
  );

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (
    select invitee_hint
    from public.employee_invitation_preview('91000000-0000-4000-8000-000000000205')
  ),
  'a***@cle91.test',
  'a one-character local part is padded rather than revealed by its length'
);

reset role;

-- ---------------------------------------------------------------------------
-- The signed-in reads it too: the page needs the same facts to detect a mismatch
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select state
    from public.employee_invitation_preview('91000000-0000-4000-8000-000000000201')
  ),
  'pending',
  'someone signed in as another account can still learn the invitation is live'
);

select is(
  (
    select invitee_hint
    from public.employee_invitation_preview('91000000-0000-4000-8000-000000000201')
  ),
  'p***@cle91.test',
  'and can be told who it is for, without being told the whole address'
);

reset role;

-- ---------------------------------------------------------------------------
-- The delivered context RPC is untouched by this addition
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege(
    'anon',
    'public.get_employee_invitation_context(uuid)',
    'EXECUTE'
  ),
  'the authenticated context RPC stays closed to anonymous callers'
);

select has_function(
  'public',
  'get_employee_invitation_context',
  array['uuid'],
  'the delivered context RPC still exists beside the preview'
);

select * from finish();

rollback;
