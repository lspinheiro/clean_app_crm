-- CLE-94 acceptance: an invitation is delivered by whether the invitee can sign in, not by
-- whether the address happens to be confirmed.
--
-- Following an invite link confirms the address, and an e-mail scanner following it for the
-- invitee does the same — but the password is only ever set inside acceptance. While
-- `account_existed` meant `email_confirmed_at is not null`, such an invitee was sent "Sign in
-- and accept the invitation", pointing at a login that does not exist, and the acceptance form
-- read the same flag and skipped the password field, producing a member who could use one
-- session and was locked out when it expired. A real invitee hit exactly this on 2026-08-28.
--
-- The two facts are separate: `account_existed` is "has a usable login", `auth_user_exists` is
-- "some auth record is already registered under this address" — the one that decides whether
-- Auth will accept another invitation for it.
--
-- The same function decides whether an address may be offered an invitation at all, and that
-- rule is scoped: preparing withdraws a lapsed invitation for this company and this address so
-- the offer can be made again, and leaves every other company's and every other address's
-- history alone. An invitation still open is not replaced — it is refused, because replacing it
-- would orphan the link already sitting in the invitee's inbox.
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into public.companies (id, name, abn, status)
values (
  '94000000-0000-4000-8000-000000000010',
  'CLE-94 Company',
  '94111111111',
  'approved'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  fixture.id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  fixture.email,
  fixture.password,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(), '', '', '', ''
from (values
  -- The owner doing the inviting, and an ordinary account that has chosen a password.
  ('94000000-0000-4000-8000-000000000001'::uuid, 'owner@cle-94.example.test',
    extensions.crypt('local-test-only', extensions.gen_salt('bf'))),
  ('94000000-0000-4000-8000-000000000002'::uuid, 'signs.in@cle-94.example.test',
    extensions.crypt('local-test-only', extensions.gen_salt('bf'))),
  -- Confirmed by following a link, never given a password. GoTrue leaves the column empty
  -- rather than null for an account created by invitation, so the empty string is the case
  -- that actually occurs in production.
  ('94000000-0000-4000-8000-000000000003'::uuid, 'no.password@cle-94.example.test', ''),
  -- The column is nullable, and an account can reach a confirmed address with nothing stored
  -- there at all. "No password" has two spellings and both have to read the same way, or the
  -- bug returns through whichever one the predicate forgot.
  ('94000000-0000-4000-8000-000000000004'::uuid, 'never.set@cle-94.example.test', null)
) as fixture(id, email, password);

insert into public.employee_memberships (company_id, profile_id, role, status)
values (
  '94000000-0000-4000-8000-000000000010',
  '94000000-0000-4000-8000-000000000001',
  'owner',
  'active'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A confirmed address with no password is NOT a usable login. This is the whole bug.
select results_eq(
  $$select account_existed, auth_user_exists
    from public.prepare_employee_invitation(
      '94000000-0000-4000-8000-000000000010',
      'no.password@cle-94.example.test',
      'staff',
      'en-AU'
    )$$,
  $$values (false, true)$$,
  'a confirmed address with no password is registered but cannot sign in'
);

select is(
  (select account_existed_at_invitation
   from public.employee_invitations
   where email = 'no.password@cle-94.example.test'),
  false,
  'the stored flag tells acceptance to ask for a password'
);

-- The other spelling of the same absence reads identically.
select results_eq(
  $$select account_existed, auth_user_exists
    from public.prepare_employee_invitation(
      '94000000-0000-4000-8000-000000000010',
      'never.set@cle-94.example.test',
      'staff',
      'en-AU'
    )$$,
  $$values (false, true)$$,
  'an account with nothing stored where the password goes also cannot sign in'
);

-- An account that has actually chosen a password can be sent a sign-in link.
select results_eq(
  $$select account_existed, auth_user_exists
    from public.prepare_employee_invitation(
      '94000000-0000-4000-8000-000000000010',
      'signs.in@cle-94.example.test',
      'staff',
      'en-AU'
    )$$,
  $$values (true, true)$$,
  'an account holding a password can sign in and accept'
);

-- An address Auth has never seen takes the invitation path.
select results_eq(
  $$select account_existed, auth_user_exists
    from public.prepare_employee_invitation(
      '94000000-0000-4000-8000-000000000010',
      'brand.new@cle-94.example.test',
      'staff',
      'en-AU'
    )$$,
  $$values (false, false)$$,
  'an unknown address is neither registered nor able to sign in'
);

-- Preparing again for the same address is refused while one is open, so the invitation from
-- the first assertion is withdrawn before the address is offered a second time.
select public.revoke_employee_invitation(
  target_invitation_id => (
    select id from public.employee_invitations
    where email = 'no.password@cle-94.example.test'
  ),
  target_company_id => '94000000-0000-4000-8000-000000000010'
);

-- Case is normalised before the lookup, or the same person reads as two different states.
select results_eq(
  $$select account_existed, auth_user_exists
    from public.prepare_employee_invitation(
      '94000000-0000-4000-8000-000000000010',
      '  NO.PASSWORD@CLE-94.example.test  ',
      'owner',
      'en-AU'
    )$$,
  $$values (false, true)$$,
  'the lookup normalises case and surrounding space'
);

-- ---------------------------------------------------------------------------
-- Which invitation a new one is allowed to replace
-- ---------------------------------------------------------------------------

-- The caller owns both companies, so nothing but the scoping of the rule itself stops the
-- withdrawal from reaching across. Two lapsed invitations sit beside the one being replaced:
-- one for the same address at the other company, one for a different address at this company.
reset role;

insert into public.companies (id, name, abn, status)
values (
  '94000000-0000-4000-8000-000000000020',
  'CLE-94 Second Company',
  '94222222222',
  'approved'
);

insert into public.employee_memberships (company_id, profile_id, role, status)
values (
  '94000000-0000-4000-8000-000000000020',
  '94000000-0000-4000-8000-000000000001',
  'owner',
  'active'
);

insert into public.employee_invitations (
  id, company_id, email, role, locale, invited_by_profile_id,
  account_existed_at_invitation, expires_at
) values
  (
    '94000000-0000-4000-8000-000000000301',
    '94000000-0000-4000-8000-000000000010',
    'lapsed@cle-94.example.test', 'staff', 'en-AU',
    '94000000-0000-4000-8000-000000000001',
    false, now() - interval '1 second'
  ),
  (
    '94000000-0000-4000-8000-000000000302',
    '94000000-0000-4000-8000-000000000020',
    'lapsed@cle-94.example.test', 'staff', 'en-AU',
    '94000000-0000-4000-8000-000000000001',
    false, now() - interval '1 second'
  ),
  (
    '94000000-0000-4000-8000-000000000303',
    '94000000-0000-4000-8000-000000000010',
    'other.lapsed@cle-94.example.test', 'staff', 'en-AU',
    '94000000-0000-4000-8000-000000000001',
    false, now() - interval '1 second'
  ),
  (
    '94000000-0000-4000-8000-000000000304',
    '94000000-0000-4000-8000-000000000010',
    'still.open@cle-94.example.test', 'staff', 'en-AU',
    '94000000-0000-4000-8000-000000000001',
    false, now() + interval '7 days'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.prepare_employee_invitation(
      '94000000-0000-4000-8000-000000000010',
      'lapsed@cle-94.example.test',
      'staff',
      'en-AU'
    )$$,
  'an invitation that has run out of time does not stop the address being offered again'
);

select is(
  (select superseded_at is not null from public.employee_invitations
   where id = '94000000-0000-4000-8000-000000000301'),
  true,
  'the lapsed invitation for this company and address is withdrawn'
);

select is(
  (select superseded_at is not null from public.employee_invitations
   where id = '94000000-0000-4000-8000-000000000302'),
  false,
  'the same address at another company keeps its invitation'
);

select is(
  (select superseded_at is not null from public.employee_invitations
   where id = '94000000-0000-4000-8000-000000000303'),
  false,
  'another address at this company keeps its invitation'
);

-- Replacing, not stacking: the withdrawn one stays as history and exactly one offer is live.
select results_eq(
  $$select
      count(*)::integer,
      count(*) filter (
        where accepted_at is null
          and revoked_at is null
          and superseded_at is null
      )::integer
    from public.employee_invitations
    where company_id = '94000000-0000-4000-8000-000000000010'
      and email = 'lapsed@cle-94.example.test'$$,
  $$values (2, 1)$$,
  'the address is left with one live invitation and the lapsed one as history'
);

-- An invitation still in flight is a link the invitee can use. Withdrawing it to mint another
-- would break that link, so the second offer is refused instead.
select throws_ok(
  $$select public.prepare_employee_invitation(
      '94000000-0000-4000-8000-000000000010',
      'still.open@cle-94.example.test',
      'staff',
      'en-AU'
    )$$,
  '23505',
  'An open invitation already exists for this e-mail',
  'an invitation still open is refused rather than replaced'
);

reset role;

select has_function(
  'public',
  'prepare_employee_invitation',
  array['uuid', 'text', 'public.employee_role', 'public.app_locale'],
  'the signature callers use is unchanged'
);

select is_definer(
  'public',
  'prepare_employee_invitation',
  array['uuid', 'text', 'public.employee_role', 'public.app_locale'],
  'invitation preparation still owns its write'
);

select * from finish();

rollback;
