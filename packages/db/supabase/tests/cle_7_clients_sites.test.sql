begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select ok(to_regclass('public.clients') is not null, 'clients table exists');
select ok(to_regclass('public.sites') is not null, 'sites table exists');
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public' and tablename in ('clients', 'sites')
  ),
  2,
  'clients and sites each have company-admin read policies'
);
select is(
  (
    select count(*)::integer
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name in ('create_client', 'create_site')
  ),
  2,
  'client and site mutations exist behind narrow RPCs'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.clients'::regclass),
  'clients has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sites'::regclass),
  'sites has RLS enabled'
);
select ok(
  has_table_privilege('authenticated', 'public.clients', 'SELECT'),
  'authenticated can read clients through RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.sites', 'SELECT'),
  'authenticated can read sites through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.clients', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.sites', 'INSERT,UPDATE,DELETE'),
  'authenticated client and site writes stay behind narrow RPCs'
);
select ok(
  has_table_privilege('service_role', 'public.clients', 'SELECT,INSERT,UPDATE,DELETE')
  and has_table_privilege('service_role', 'public.sites', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role has explicit client and site DML grants'
);
select is(
  (
    select count(*)::integer
    from public.sites
    where client_id = '10000000-0000-4000-8000-000000000301'
  ),
  3,
  'the local seed includes a three-site client'
);
select is(
  (
    select count(*)::integer
    from public.sites
    where client_id = '10000000-0000-4000-8000-000000000302'
  ),
  1,
  'the local seed includes a normal single-site client'
);
select throws_ok(
  $$insert into public.sites (client_id, name, address, suburb)
    values (null, 'Orphan', '1 Test Street', 'Robina')$$,
  '23502',
  null,
  'a site cannot omit its client'
);
select throws_ok(
  $$insert into public.sites (client_id, name, address, suburb)
    values ('99999999-9999-4999-8999-999999999999', 'Orphan', '1 Test Street', 'Robina')$$,
  '23503',
  null,
  'a site cannot reference a nonexistent client'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'tenant-b-client-admin@example.test',
  crypt('local-test-only', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Tenant B Client Admin"}', now(), now(), '', '', '', ''
);
insert into public.companies (id, name, abn, status)
values ('20000000-0000-4000-8000-000000000010', 'Tenant B Client Demo', '22222222222', 'approved');
insert into public.employee_memberships (company_id, profile_id, role)
values ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.clients
    where id in (
      '10000000-0000-4000-8000-000000000301',
      '10000000-0000-4000-8000-000000000302'
    )
  ),
  2,
  'company admin sees their seeded clients'
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
  ),
  4,
  'company admin sees their seeded sites'
);
select lives_ok(
  $$select public.create_client(
    '10000000-0000-4000-8000-000000000010',
    '  RPC Client  ',
    '',
    '',
    ''
  )$$,
  'company admin can create a client in their company'
);
select lives_ok(
  $$select public.create_site(
    (select id from public.clients where name = 'RPC Client'),
    '  RPC Site  ',
    '  1 Test Street  ',
    '  Robina  ',
    ''
  )$$,
  'company admin can add a site to their client'
);
select results_eq(
  $$select contact_name, phone, notes from public.clients where name = 'RPC Client'$$,
  $$values (null::text, null::text, null::text)$$,
  'blank optional client fields are stored as null'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.clients), 0, 'another company admin cannot read foreign clients');
select is((select count(*)::integer from public.sites), 0, 'another company admin cannot read foreign sites');
select throws_ok(
  $$select public.create_client(
    '10000000-0000-4000-8000-000000000010',
    'Foreign Client', null, null, null
  )$$,
  '42501',
  'Company admin access required',
  'another company admin cannot create a client in the foreign company'
);
select throws_ok(
  $$select public.create_site(
    '10000000-0000-4000-8000-000000000301',
    'Foreign Site', '1 Test Street', 'Robina', null
  )$$,
  '42501',
  'Company admin access required',
  'another company admin cannot add a site to a foreign client'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.clients), 0, 'cleaner cannot read raw clients');
select is((select count(*)::integer from public.sites), 0, 'cleaner cannot read raw sites');
select throws_ok(
  $$select public.create_client(
    '10000000-0000-4000-8000-000000000010',
    'Cleaner Client', null, null, null
  )$$,
  '42501',
  'Company admin access required',
  'cleaner cannot create a client'
);
select throws_ok(
  $$select public.create_site(
    '10000000-0000-4000-8000-000000000301',
    'Cleaner Site', '1 Test Street', 'Robina', null
  )$$,
  '42501',
  'Company admin access required',
  'cleaner cannot create a site'
);
reset role;

select * from finish();
rollback;
