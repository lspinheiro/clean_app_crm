begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select has_column(
  'public',
  'profiles',
  'last_active_company',
  'profiles persist the active company server-side'
);

select col_is_null(
  'public',
  'profiles',
  'last_active_company',
  'the active-company preference is optional before membership resolution'
);

select fk_ok(
  'public',
  'profiles',
  'last_active_company',
  'public',
  'companies',
  'id',
  'the saved active company references a company'
);

select has_function(
  'public',
  'set_active_company',
  array['uuid'],
  'active-company changes go through a narrow RPC'
);

select function_returns(
  'public',
  'set_active_company',
  array['uuid'],
  'uuid',
  'the active-company RPC returns the accepted company id or nothing'
);

select is_definer(
  'public',
  'set_active_company',
  array['uuid'],
  'the active-company RPC owns its profile write'
);

select function_privs_are(
  'public',
  'set_active_company',
  array['uuid'],
  'authenticated',
  array['EXECUTE'],
  'authenticated accounts can call only the granted RPC capability'
);

select function_privs_are(
  'public',
  'set_active_company',
  array['uuid'],
  'anon',
  array[]::text[],
  'anonymous accounts cannot change active company'
);

select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'the new profile column has an explicit authenticated read grant'
);

select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE'),
  'the new profile column retains explicit service-role DML grants'
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
  ('82000000-0000-4000-8000-000000000001'::uuid, 'multi@cle-82.example.test', 'Multi-company Employee'),
  ('82000000-0000-4000-8000-000000000002'::uuid, 'single@cle-82.example.test', 'Single-company Employee'),
  ('82000000-0000-4000-8000-000000000003'::uuid, 'pool-only@cle-82.example.test', 'No Employee Membership')
) as fixture(id, email, full_name);

insert into public.companies (id, name, abn, status)
values
  ('82000000-0000-4000-8000-000000000010', 'CLE-82 Coastal Company', '82111111111', 'approved'),
  ('82000000-0000-4000-8000-000000000020', 'CLE-82 Harbour Company', '82222222222', 'approved'),
  ('82000000-0000-4000-8000-000000000030', 'CLE-82 Unrelated Company', '82333333333', 'approved');

insert into public.employee_memberships (company_id, profile_id, role, status, joined_at)
values
  ('82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000001', 'owner', 'active', '2026-08-01T00:00:00+10'),
  ('82000000-0000-4000-8000-000000000020', '82000000-0000-4000-8000-000000000001', 'staff', 'active', '2026-08-02T00:00:00+10'),
  ('82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000002', 'staff', 'active', '2026-08-01T00:00:00+10');

insert into public.clients (id, company_id, name)
values
  ('82000000-0000-4000-8000-000000000101', '82000000-0000-4000-8000-000000000010', 'Visible Active-company Client'),
  ('82000000-0000-4000-8000-000000000102', '82000000-0000-4000-8000-000000000030', 'Unrelated Private Client');

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.set_active_company('82000000-0000-4000-8000-000000000020'),
  '82000000-0000-4000-8000-000000000020'::uuid,
  'a multi-membership account can switch to another active employee company'
);

select is(
  (select last_active_company from public.profiles where id = auth.uid()),
  '82000000-0000-4000-8000-000000000020'::uuid,
  'the selected company persists on the profile'
);

select is(
  public.set_active_company('82000000-0000-4000-8000-000000000010'),
  '82000000-0000-4000-8000-000000000010'::uuid,
  'switching back replaces the server-side preference'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.set_active_company('82000000-0000-4000-8000-000000000010'),
  '82000000-0000-4000-8000-000000000010'::uuid,
  'a single-membership account is scoped automatically through the same capability'
);

select is(
  public.set_active_company('82000000-0000-4000-8000-000000000020'),
  null::uuid,
  'a company without an active employee membership is not accepted'
);

select is(
  (select last_active_company from public.profiles where id = auth.uid()),
  '82000000-0000-4000-8000-000000000010'::uuid,
  'an unauthorised switch leaves the active company unchanged'
);

select is(
  (select count(*)::integer from public.clients
    where company_id = '82000000-0000-4000-8000-000000000030'),
  0,
  'a company-scoped request without an active membership returns nothing'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.set_active_company('82000000-0000-4000-8000-000000000010'),
  null::uuid,
  'an account with no employee membership cannot select a company'
);
reset role;

select * from finish();
rollback;
