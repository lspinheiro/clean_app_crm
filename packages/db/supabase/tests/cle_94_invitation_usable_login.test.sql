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
begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

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
  ('94000000-0000-4000-8000-000000000003'::uuid, 'no.password@cle-94.example.test', '')
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
