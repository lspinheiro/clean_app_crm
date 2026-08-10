begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Local UI verification may edit the demo site's defaults. Re-establish the
-- fixture inside this transaction so the test does not depend on dev state.
update public.sites
set
  default_service_id = '30000000-0000-4000-8000-000000000002',
  default_duration_minutes = 120,
  default_rate_cents = 15000
where id = '10000000-0000-4000-8000-000000000401';

select ok(to_regclass('public.service_catalogue') is not null, 'service catalogue exists');
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sites'
      and column_name in ('default_service_id', 'default_duration_minutes', 'default_rate_cents')
  ),
  3,
  'sites carry the complete defaults tuple'
);
select is(
  (
    select count(*)::integer
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name in ('update_client', 'update_site')
  ),
  2,
  'client and site edits exist behind narrow RPCs'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public' and tablename = 'service_catalogue'
  ),
  1,
  'the service catalogue has an authenticated read policy'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.service_catalogue'::regclass),
  'service catalogue has RLS enabled'
);
select ok(
  has_table_privilege('authenticated', 'public.service_catalogue', 'SELECT'),
  'authenticated users can read the service catalogue'
);
select ok(
  not has_table_privilege('authenticated', 'public.service_catalogue', 'INSERT,UPDATE,DELETE'),
  'authenticated users cannot mutate the service catalogue'
);
select ok(
  has_table_privilege('service_role', 'public.service_catalogue', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role has explicit catalogue DML grants'
);
select is((select count(*)::integer from public.service_catalogue), 4, 'catalogue has four M1 services');
select results_eq(
  $$select name from public.service_catalogue order by sort_order$$,
  array['Office clean', 'Standard clean', 'Deep clean', 'End-of-lease clean']::text[],
  'catalogue contains the required services in stable display order'
);
select is(
  (
    select count(*)::integer
    from public.sites
    where id in (
      '10000000-0000-4000-8000-000000000401',
      '10000000-0000-4000-8000-000000000402',
      '10000000-0000-4000-8000-000000000403',
      '10000000-0000-4000-8000-000000000404'
    )
      and default_service_id is not null
      and default_duration_minutes is not null
      and default_rate_cents is not null
  ),
  4,
  'all local demo sites have complete defaults'
);
select results_eq(
  $$select service.name, site.default_duration_minutes, site.default_rate_cents
    from public.sites site
    join public.service_catalogue service on service.id = site.default_service_id
    where site.id = '10000000-0000-4000-8000-000000000401'$$,
  $$values ('Standard clean'::text, 120, 15000)$$,
  'seeded site defaults use canonical catalogue and integer units'
);
select throws_ok(
  $$update public.sites set default_rate_cents = null
    where id = '10000000-0000-4000-8000-000000000401'$$,
  '23514',
  null,
  'a partial defaults tuple is rejected'
);
select throws_ok(
  $$update public.sites
    set default_service_id = '99999999-9999-4999-8999-999999999999'
    where id = '10000000-0000-4000-8000-000000000401'$$,
  '23503',
  null,
  'a site cannot reference an unknown service'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'tenant-b-defaults-admin@example.test',
  crypt('local-test-only', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Tenant B Defaults Admin"}', now(), now(), '', '', '', ''
);
update public.profiles
set role = 'company_admin'
where id = '20000000-0000-4000-8000-000000000001';
insert into public.companies (id, name, abn, status)
values ('20000000-0000-4000-8000-000000000010', 'Tenant B Defaults Demo', '22222222222', 'approved');
insert into public.company_members (company_id, profile_id)
values ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.update_client(
    '10000000-0000-4000-8000-000000000301',
    'Oceanview Property Group',
    'Morgan Ellis Updated',
    '07 5555 0101',
    'Updated by RPC'
  )$$,
  'company admin can edit their client'
);
select lives_ok(
  $$select public.update_site(
    '10000000-0000-4000-8000-000000000401',
    'Broadbeach Towers',
    '12 Surf Parade',
    'Broadbeach',
    'Updated access notes',
    '30000000-0000-4000-8000-000000000001',
    150,
    16550
  )$$,
  'company admin can atomically edit their site and defaults'
);
select results_eq(
  $$select contact_name, notes from public.clients where id = '10000000-0000-4000-8000-000000000301'$$,
  $$values ('Morgan Ellis Updated'::text, 'Updated by RPC'::text)$$,
  'client edit persists to the canonical row'
);
select results_eq(
  $$select address, default_service_id, default_duration_minutes, default_rate_cents
    from public.sites where id = '10000000-0000-4000-8000-000000000401'$$,
  $$values (
    '12 Surf Parade'::text,
    '30000000-0000-4000-8000-000000000001'::uuid,
    150,
    16550
  )$$,
  'site edit persists address and integer defaults together'
);
select throws_ok(
  $$select public.update_site(
    '10000000-0000-4000-8000-000000000401',
    'Broadbeach Towers', '14 Surf Parade', 'Broadbeach', null,
    '30000000-0000-4000-8000-000000000001', 0, 17000
  )$$,
  '23514',
  'Site duration and rate must be greater than zero',
  'non-positive site defaults are rejected'
);
select results_eq(
  $$select address, default_duration_minutes from public.sites
    where id = '10000000-0000-4000-8000-000000000401'$$,
  $$values ('12 Surf Parade'::text, 150)$$,
  'a rejected defaults edit leaves the prior row unchanged'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.update_client(
    '10000000-0000-4000-8000-000000000301',
    'Foreign edit', null, null, null
  )$$,
  '42501',
  'Company admin access required',
  'another company admin cannot edit a foreign client'
);
select throws_ok(
  $$select public.update_site(
    '10000000-0000-4000-8000-000000000401',
    'Foreign site', '1 Test Street', 'Robina', null,
    '30000000-0000-4000-8000-000000000001', 60, 10000
  )$$,
  '42501',
  'Company admin access required',
  'another company admin cannot edit a foreign site'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.update_client(
    '10000000-0000-4000-8000-000000000301',
    'Cleaner edit', null, null, null
  )$$,
  '42501',
  'Company admin access required',
  'cleaner cannot edit client data'
);
select throws_ok(
  $$select public.update_site(
    '10000000-0000-4000-8000-000000000401',
    'Cleaner site', '1 Test Street', 'Robina', null,
    '30000000-0000-4000-8000-000000000001', 60, 10000
  )$$,
  '42501',
  'Company admin access required',
  'cleaner cannot edit site defaults or sensitive address data'
);
reset role;

select * from finish();
rollback;
