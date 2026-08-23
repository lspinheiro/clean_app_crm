begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

select col_is_unique(
  'public',
  'companies',
  'abn',
  'company ABN is the race-safe tenant identity boundary'
);

select has_function(
  'public',
  'create_company',
  array['text', 'text'],
  'additional company creation goes through one narrow RPC'
);

select function_returns(
  'public',
  'create_company',
  array['text', 'text'],
  'uuid',
  'the company-creation RPC returns the new active company id'
);

select is_definer(
  'public',
  'create_company',
  array['text', 'text'],
  'the company-creation RPC owns every tenant bootstrap write'
);

select function_privs_are(
  'public',
  'create_company',
  array['text', 'text'],
  'authenticated',
  array['EXECUTE'],
  'authenticated employees can call the account-level capability'
);

select function_privs_are(
  'public',
  'create_company',
  array['text', 'text'],
  'service_role',
  array['EXECUTE'],
  'trusted server processes retain the explicit company-creation grant'
);

select function_privs_are(
  'public',
  'create_company',
  array['text', 'text'],
  'anon',
  array[]::text[],
  'anonymous accounts cannot create a company'
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
  extensions.crypt('local-test-only', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  pg_catalog.jsonb_build_object('full_name', fixture.full_name),
  now(), now(), '', '', '', ''
from (values
  ('35000000-0000-4000-8000-000000000001'::uuid, 'owner@company-creation.example.test', 'Existing Owner'),
  ('35000000-0000-4000-8000-000000000002'::uuid, 'staff@company-creation.example.test', 'Existing Staff'),
  ('35000000-0000-4000-8000-000000000003'::uuid, 'pool-only@company-creation.example.test', 'No Employee Membership')
) as fixture(id, email, full_name);

insert into public.companies (id, name, abn, status)
values (
  '35000000-0000-4000-8000-000000000010',
  'Existing Company',
  '35111111111',
  'approved'
);

insert into public.employee_memberships (company_id, profile_id, role, status)
values
  ('35000000-0000-4000-8000-000000000010', '35000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('35000000-0000-4000-8000-000000000010', '35000000-0000-4000-8000-000000000002', 'staff', 'active');

update public.profiles
set last_active_company = '35000000-0000-4000-8000-000000000010'
where id in (
  '35000000-0000-4000-8000-000000000001',
  '35000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.create_company('  Owner Created Company  ', '35 222 222 222')$$,
  'an existing Owner can create another company'
);

select is(
  (select status from public.companies where abn = '35222222222'),
  'approved'::public.company_status,
  'an in-CRM company is immediately approved'
);

select results_eq(
  $$select membership.role, membership.status
    from public.employee_memberships membership
    join public.companies company on company.id = membership.company_id
    where company.abn = '35222222222'
      and membership.profile_id = '35000000-0000-4000-8000-000000000001'$$,
  $$values ('owner'::public.employee_role, 'active'::public.member_status)$$,
  'the creator becomes the new company first active Owner'
);

select is(
  (select company.abn
    from public.profiles profile
    join public.companies company on company.id = profile.last_active_company
    where profile.id = auth.uid()),
  '35222222222'::text,
  'the new company becomes the creator active context'
);

select is(
  (select role from public.employee_memberships
    where company_id = '35000000-0000-4000-8000-000000000010'
      and profile_id = auth.uid()),
  'owner'::public.employee_role,
  'company creation does not alter the source-company Owner role'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.create_company('Staff Created Company', '35333333333')$$,
  'an existing Staff employee can create an independent company'
);

select is(
  (select status from public.companies where abn = '35333333333'),
  'approved'::public.company_status,
  'a Staff-created company uses the same approved lifecycle'
);

select results_eq(
  $$select membership.role, membership.status
    from public.employee_memberships membership
    join public.companies company on company.id = membership.company_id
    where company.abn = '35333333333'
      and membership.profile_id = '35000000-0000-4000-8000-000000000002'$$,
  $$values ('owner'::public.employee_role, 'active'::public.member_status)$$,
  'Staff in one tenant becomes Owner only in the new tenant'
);

select is(
  (select role from public.employee_memberships
    where company_id = '35000000-0000-4000-8000-000000000010'
      and profile_id = auth.uid()),
  'staff'::public.employee_role,
  'the original Staff membership remains unchanged'
);

select is(
  (select company.abn
    from public.profiles profile
    join public.companies company on company.id = profile.last_active_company
    where profile.id = auth.uid()),
  '35333333333'::text,
  'the Staff-created company becomes active'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.create_company('Duplicate ABN Company', '35333333333')$$,
  '23505',
  'Company ABN already exists',
  'an existing ABN is rejected at the transaction boundary'
);

-- Inspect cross-tenant state outside authenticated RLS after exercising the caller contract.
reset role;

select is(
  (select count(*)::integer from public.companies where abn = '35333333333'),
  1,
  'a duplicate request creates no second company'
);

select is(
  (select company.abn
    from public.profiles profile
    join public.companies company on company.id = profile.last_active_company
    where profile.id = auth.uid()),
  '35222222222'::text,
  'a duplicate request leaves the previous active company unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.create_company('', '123')$$,
  '23514',
  'Company name is required',
  'invalid identity is rejected before any write'
);

select is(
  (select count(*)::integer from public.companies where name = '' or abn = '123'),
  0,
  'invalid input creates no company'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.create_company('Unauthorised Company', '35444444444')$$,
  '42501',
  'Active CRM employee membership required',
  'a no-company or pool-only account cannot bootstrap CRM authority'
);

select is(
  (select count(*)::integer from public.companies where abn = '35444444444'),
  0,
  'an unauthorised call creates no company'
);
reset role;

select * from finish();
rollback;
