begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- Shape and authorisation --------------------------------------------------

select has_column(
  'public', 'profiles', 'suburb',
  'registration can record the suburb a cleaner works from'
);
select is(
  (
    select count(*)::integer
    from information_schema.routines
    where routine_schema = 'public' and routine_name = 'cleaner_invite_preview'
  ),
  1,
  'the join screen reads invite context through a single narrow RPC'
);
select ok(
  has_function_privilege('anon', 'public.cleaner_invite_preview(text)', 'EXECUTE'),
  'invite context is readable before the cleaner has an account'
);
select ok(
  has_function_privilege('authenticated', 'public.cleaner_invite_preview(text)', 'EXECUTE'),
  'a signed-in cleaner can still read invite context'
);
select ok(
  has_function_privilege('service_role', 'public.cleaner_invite_preview(text)', 'EXECUTE'),
  'service role has an explicit invite preview grant'
);
select is(
  (
    select count(*)::integer
    from information_schema.routines
    where routine_schema = 'public' and routine_name = 'join_company_pool'
  ),
  1,
  'joining a pool is a single security-definer RPC'
);
select ok(
  not has_function_privilege('anon', 'public.join_company_pool(text, text, text, text)', 'EXECUTE'),
  'anonymous callers cannot join a pool'
);
select ok(
  has_function_privilege('authenticated', 'public.join_company_pool(text, text, text, text)', 'EXECUTE'),
  'authenticated cleaners can join subject to RPC authorisation'
);
select ok(
  has_function_privilege('service_role', 'public.join_company_pool(text, text, text, text)', 'EXECUTE'),
  'service role has an explicit join grant'
);
select is(
  (
    select array_to_string(procedure.proargnames[2:], ',')
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'cleaner_invite_preview'
  ),
  'state,company_name,pool_size',
  'invite context exposes only the company name and pool size, never member identities'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'profiles stay writable only through RPCs'
);

-- Fixtures -----------------------------------------------------------------

insert into public.company_invites (id, company_id, code, revoked_at)
values (
  '30000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000010',
  'ZREVOKEDFIXTURE1',
  '2026-08-01T00:00:00+10'
);

insert into public.companies (id, name, abn, status)
values ('30000000-0000-4000-8000-000000000010', 'Tenant B Join Demo', '33333333333', 'approved');
insert into public.company_invites (id, company_id, code, expires_at)
values (
  '30000000-0000-4000-8000-000000000202',
  '30000000-0000-4000-8000-000000000010',
  'ZEXPIREDFIXTURE1',
  '2026-08-01T00:00:00+10'
);

-- A pool this test fully controls, so the count assertion does not depend on how many
-- cleaners the seeded demo company happens to have.
insert into public.companies (id, name, abn, status)
values ('30000000-0000-4000-8000-000000000020', 'Tenant C Pool Demo', '44444444444', 'approved');
insert into public.company_invites (id, company_id, code)
values (
  '30000000-0000-4000-8000-000000000203',
  '30000000-0000-4000-8000-000000000020',
  'ZPOOL1FIXTURE001'
);
insert into public.company_members (company_id, profile_id, status)
values
  ('30000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000002', 'active'),
  ('30000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000003', 'removed'),
  ('30000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000001', 'active');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'joiner@example.test',
  crypt('local-test-only', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"New cleaner"}', now(), now(), '', '', '', ''
);

-- Invite context before signing in ------------------------------------------

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select is(
  (select state from public.cleaner_invite_preview('CLEAN1DEMOJOIN99')),
  'active',
  'a live invite code reports an active state'
);
select is(
  (select company_name from public.cleaner_invite_preview('CLEAN1DEMOJOIN99')),
  'Coastal Demo Cleaning',
  'a live invite names the company that sent it'
);
select is(
  (select pool_size from public.cleaner_invite_preview('ZPOOL1FIXTURE001')),
  2,
  'the pool size counts every active pool membership, including an employee of another company'
);
select is(
  (select state from public.cleaner_invite_preview('NOPE12FIXTURE001')),
  'unknown',
  'an unrecognised code is reported as unknown'
);
select is(
  (select state from public.cleaner_invite_preview('ZREVOKEDFIXTURE1')),
  'revoked',
  'a rotated-away code is reported as revoked'
);
select is(
  (select state from public.cleaner_invite_preview('ZEXPIREDFIXTURE1')),
  'expired',
  'a code past its expiry is reported as expired'
);
reset role;

-- Joining --------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.join_company_pool('CLEAN1DEMOJOIN99', 'Ana Silva', '0400 000 111', 'Southport')$$,
  'a signed-in cleaner joins the pool from a live invite code'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.company_members
    where company_id = '10000000-0000-4000-8000-000000000010'
      and profile_id = '30000000-0000-4000-8000-000000000001'
      and status = 'active'
  ),
  1,
  'joining creates exactly one active membership'
);
select results_eq(
  $$select full_name, phone, suburb
    from public.profiles
    where id = '30000000-0000-4000-8000-000000000001'$$,
  $$values ('Ana Silva'::text, '0400 000 111'::text, 'Southport'::text)$$,
  'registration persists the name, phone, and suburb on the cleaner profile'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.join_company_pool('CLEAN1DEMOJOIN99', 'Ana Silva', '0400 000 111', 'Southport')$$,
  'reopening the same invite link does not fail'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.company_members
    where company_id = '10000000-0000-4000-8000-000000000010'
      and profile_id = '30000000-0000-4000-8000-000000000001'
  ),
  1,
  'reopening the same invite link does not duplicate the membership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.join_company_pool('NOPE12FIXTURE001', 'Ana Silva', '0400 000 111', 'Southport')$$,
  '22023',
  'Invite code not found',
  'an unrecognised code cannot join a pool'
);
select throws_ok(
  $$select public.join_company_pool('ZREVOKEDFIXTURE1', 'Ana Silva', '0400 000 111', 'Southport')$$,
  '22023',
  'Invite code is no longer active',
  'a rotated-away code cannot join a pool'
);
select throws_ok(
  $$select public.join_company_pool('ZEXPIREDFIXTURE1', 'Ana Silva', '0400 000 111', 'Southport')$$,
  '22023',
  'Invite code has expired',
  'an expired code cannot join a pool'
);
select throws_ok(
  $$select public.join_company_pool('CLEAN1DEMOJOIN99', '   ', '0400 000 111', 'Southport')$$,
  '22023',
  'Full name, phone, and suburb are required',
  'registration refuses a blank name'
);
select throws_ok(
  $$select public.join_company_pool('CLEAN1DEMOJOIN99', 'Ana Silva', '0400 000 111', '  ')$$,
  '22023',
  'Full name, phone, and suburb are required',
  'registration refuses a blank suburb'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.join_company_pool('CLEAN1DEMOJOIN99', 'Demo Company Admin', '0400 000 222', 'Southport')$$,
  'an employee can also join the cleaner pool for the same company'
);
reset role;
select results_eq(
  $$select
      exists (
        select 1
        from public.employee_memberships
        where company_id = '10000000-0000-4000-8000-000000000010'
          and profile_id = '10000000-0000-4000-8000-000000000001'
          and status = 'active'
      ),
      exists (
        select 1
        from public.company_members
        where company_id = '10000000-0000-4000-8000-000000000010'
          and profile_id = '10000000-0000-4000-8000-000000000001'
          and status = 'active'
      )$$,
  $$values (true, true)$$,
  'same-company employee and cleaner memberships coexist for one account'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.join_company_pool('CLEAN1DEMOJOIN99', 'Demo Removed Cleaner', '0400 000 333', 'Southport')$$,
  '42501',
  'This company removed you from their pool',
  'a removed cleaner cannot rejoin herself through the invite link'
);
reset role;
select is(
  (
    select status::text
    from public.company_members
    where company_id = '10000000-0000-4000-8000-000000000010'
      and profile_id = '10000000-0000-4000-8000-000000000005'
  ),
  'removed',
  'a refused rejoin leaves the removal in place'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select public.join_company_pool('CLEAN1DEMOJOIN99', 'Ana Silva', '0400 000 111', 'Southport')$$,
  '42501',
  'permission denied for function join_company_pool',
  'an anonymous caller is refused at the grant boundary'
);
reset role;

select * from finish();
rollback;
