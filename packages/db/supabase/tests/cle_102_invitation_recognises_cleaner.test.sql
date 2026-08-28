-- CLE-102 acceptance: the signed-in invitee's context says whether they already clean here.
--
-- A company can invite one of its own cleaners onto the office side under the same sign-in
-- address. `get_employee_invitation_context` described the invitation and never the person, so
-- the page could only offer a generic join — and the invitee had no way to tell whether
-- accepting added a role to the account they already have or started a second one.
--
-- `cleaner_membership_active` is that fact, and it is read for the caller only: the column is
-- computed against `auth.uid()`'s own cleaner membership at the inviting company, so it can
-- never describe somebody else. The anonymous `employee_invitation_preview` is untouched and
-- still names no company, no role and no address, which is what keeps the fact off the screen
-- anybody holding the link can reach.
--
-- Acceptance itself is unchanged: it writes an employee membership and leaves the cleaner
-- membership exactly where it was.
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

-- ---------------------------------------------------------------------------
-- Fixtures: two companies, an owner, and one person who cleans for the first
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, abn, status)
values
  (
    '02000000-0000-4000-8000-000000000010',
    'CLE-102 Inviting Company',
    '10200000001',
    'approved'
  ),
  (
    '02000000-0000-4000-8000-000000000011',
    'CLE-102 Other Company',
    '10200000002',
    'approved'
  );

-- The profile trigger fires off auth.users, so everybody starts there.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  (
    '02000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'owner@cle102.test',
    extensions.crypt('local-test-only', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    pg_catalog.jsonb_build_object('full_name', 'CLE-102 Owner'),
    now(), now(), '', '', '', ''
  ),
  (
    '02000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'cleaner@cle102.test',
    extensions.crypt('local-test-only', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    pg_catalog.jsonb_build_object('full_name', 'CLE-102 Cleaner'),
    now(), now(), '', '', '', ''
  ),
  (
    '02000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'stranger@cle102.test',
    extensions.crypt('local-test-only', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    pg_catalog.jsonb_build_object('full_name', 'CLE-102 Stranger'),
    now(), now(), '', '', '', ''
  ),
  (
    '02000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'former@cle102.test',
    extensions.crypt('local-test-only', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    pg_catalog.jsonb_build_object('full_name', 'CLE-102 Former Cleaner'),
    now(), now(), '', '', '', ''
  ),
  (
    '02000000-0000-4000-8000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'elsewhere@cle102.test',
    extensions.crypt('local-test-only', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    pg_catalog.jsonb_build_object('full_name', 'CLE-102 Cleaner Elsewhere'),
    now(), now(), '', '', '', ''
  );

insert into public.employee_memberships (id, company_id, profile_id, role, status)
values (
  '02000000-0000-4000-8000-000000000091',
  '02000000-0000-4000-8000-000000000010',
  '02000000-0000-4000-8000-000000000001',
  'owner',
  'active'
);

-- Cleaner memberships live in `company_members` (the schema keeps the legacy pool name).
insert into public.company_members (id, company_id, profile_id, status)
values
  (
    '02000000-0000-4000-8000-000000000201',
    '02000000-0000-4000-8000-000000000010',
    '02000000-0000-4000-8000-000000000002',
    'active'
  ),
  -- Removed from the inviting company's cleaner staff: the relationship is over, so the page
  -- must not claim it.
  (
    '02000000-0000-4000-8000-000000000202',
    '02000000-0000-4000-8000-000000000010',
    '02000000-0000-4000-8000-000000000004',
    'removed'
  ),
  -- Cleans, but for somebody else. Reading the membership without its company would tell this
  -- person the inviting company already works with them.
  (
    '02000000-0000-4000-8000-000000000203',
    '02000000-0000-4000-8000-000000000011',
    '02000000-0000-4000-8000-000000000005',
    'active'
  );

insert into public.employee_invitations (
  id, company_id, email, role, locale, invited_by_profile_id,
  account_existed_at_invitation, expires_at
) values
  (
    '02000000-0000-4000-8000-000000000301',
    '02000000-0000-4000-8000-000000000010',
    'cleaner@cle102.test', 'staff', 'en-AU',
    '02000000-0000-4000-8000-000000000001',
    true, now() + interval '7 days'
  ),
  (
    '02000000-0000-4000-8000-000000000302',
    '02000000-0000-4000-8000-000000000010',
    'stranger@cle102.test', 'staff', 'en-AU',
    '02000000-0000-4000-8000-000000000001',
    true, now() + interval '7 days'
  ),
  (
    '02000000-0000-4000-8000-000000000303',
    '02000000-0000-4000-8000-000000000010',
    'former@cle102.test', 'staff', 'en-AU',
    '02000000-0000-4000-8000-000000000001',
    true, now() + interval '7 days'
  ),
  (
    '02000000-0000-4000-8000-000000000304',
    '02000000-0000-4000-8000-000000000010',
    'elsewhere@cle102.test', 'staff', 'en-AU',
    '02000000-0000-4000-8000-000000000001',
    true, now() + interval '7 days'
  );

-- ---------------------------------------------------------------------------
-- The signed-in invitee's own context
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '02000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select cleaner_membership_active
      from public.get_employee_invitation_context(
        '02000000-0000-4000-8000-000000000301'
      )$$,
  $$values (true)$$,
  'an invitee who cleans for the inviting company is recognised'
);

select results_eq(
  $$select invitation_status::text collate "C", company_name, role::text collate "C"
      from public.get_employee_invitation_context(
        '02000000-0000-4000-8000-000000000301'
      )$$,
  $$values ('pending'::text collate "C", 'CLE-102 Inviting Company'::text, 'staff'::text collate "C")$$,
  'and the rest of the context still reads exactly as it did'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '02000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select cleaner_membership_active
      from public.get_employee_invitation_context(
        '02000000-0000-4000-8000-000000000302'
      )$$,
  $$values (false)$$,
  'an invitee with no cleaner membership is not claimed as one'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '02000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select cleaner_membership_active
      from public.get_employee_invitation_context(
        '02000000-0000-4000-8000-000000000303'
      )$$,
  $$values (false)$$,
  'a removed cleaner is not told the company still works with them'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '02000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select cleaner_membership_active
      from public.get_employee_invitation_context(
        '02000000-0000-4000-8000-000000000304'
      )$$,
  $$values (false)$$,
  'cleaning for a different company does not count as cleaning for this one'
);

-- ---------------------------------------------------------------------------
-- The anonymous preview learns nothing new
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (select count(*)::int
     from pg_catalog.pg_proc procedure
     join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
     cross join lateral unnest(procedure.proargnames) as returned(name)
     where namespace.nspname = 'public'
       and procedure.proname = 'employee_invitation_preview'
       and returned.name = 'cleaner_membership_active'),
  0,
  'the screen anybody holding the link can reach does not learn who cleans here'
);

select results_eq(
  $$select state, company_name
      from public.employee_invitation_preview(
        '02000000-0000-4000-8000-000000000301'
      )$$,
  $$values ('pending'::text, 'CLE-102 Inviting Company'::text)$$,
  'and it still answers the states it always did'
);

-- ---------------------------------------------------------------------------
-- Acceptance adds the role and leaves the cleaner membership alone
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '02000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.accept_employee_invitation(
      '02000000-0000-4000-8000-000000000301',
      'CLE-102 Cleaner',
      'en-AU'
    )$$,
  'the cleaner accepts the employee invitation on the account they already sign in with'
);

reset role;

select results_eq(
  $$select
      (select count(*) from public.company_members
        where id = '02000000-0000-4000-8000-000000000201'
          and company_id = '02000000-0000-4000-8000-000000000010'
          and profile_id = '02000000-0000-4000-8000-000000000002'
          and status = 'active'),
      (select count(*) from public.company_members
        where profile_id = '02000000-0000-4000-8000-000000000002'),
      (select count(*) from public.employee_memberships
        where company_id = '02000000-0000-4000-8000-000000000010'
          and profile_id = '02000000-0000-4000-8000-000000000002'
          and role = 'staff'
          and status = 'active')$$,
  $$values (1::bigint, 1::bigint, 1::bigint)$$,
  'the same cleaner membership survives acceptance untouched, and one staff role is added'
);

select * from finish();

rollback;
