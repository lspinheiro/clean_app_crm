begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'authenticated can select profiles through RLS');
select ok(has_table_privilege('authenticated', 'public.companies', 'SELECT'), 'authenticated can select companies through RLS');
select ok(
  not has_table_privilege('authenticated', 'public.companies', 'UPDATE'),
  'authenticated company writes stay behind narrow security-definer RPCs'
);
select ok(has_table_privilege('authenticated', 'public.company_members', 'SELECT'), 'authenticated can select memberships through RLS');
select ok(has_table_privilege('authenticated', 'public.company_invites', 'SELECT'), 'authenticated can select invites through RLS');
select ok(has_table_privilege('service_role', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE'), 'service role owns profile DML');
select ok(has_table_privilege('service_role', 'public.companies', 'SELECT,INSERT,UPDATE,DELETE'), 'service role owns company DML');
select ok(has_table_privilege('service_role', 'public.company_members', 'SELECT,INSERT,UPDATE,DELETE'), 'service role owns membership DML');
select ok(has_table_privilege('service_role', 'public.company_invites', 'SELECT,INSERT,UPDATE,DELETE'), 'service role owns invite DML');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'tenant-b-admin@example.test',
  crypt('local-test-only', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Tenant B Admin"}', now(), now(), '', '', '', ''
);
update public.profiles
set role = 'company_admin'
where id = '20000000-0000-4000-8000-000000000001';
insert into public.companies (id, name, abn, status)
values ('20000000-0000-4000-8000-000000000010', 'Tenant B Demo', '22222222222', 'approved');
insert into public.company_members (company_id, profile_id)
values ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select name from public.companies order by name$$,
  array['Coastal Demo Cleaning']::text[],
  'company admin sees only their company'
);
select is(
  (select count(*)::integer from public.company_invites where revoked_at is null),
  1,
  'company admin sees exactly one active invite'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.companies where id = '10000000-0000-4000-8000-000000000010'), 0, 'cross-company read returns no rows');
select is(
  (select count(*)::integer from public.companies where id = '20000000-0000-4000-8000-000000000010'),
  1,
  'second admin still sees their own company'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.company_members), 0, 'cleaner cannot read raw memberships');
select is((select count(*)::integer from public.company_invites), 0, 'cleaner cannot read raw invites');
select is((select count(*)::integer from public.profiles where id <> auth.uid()), 0, 'cleaner cannot read other profiles');
reset role;

set local role anon;
select throws_ok(
  $$select * from public.companies$$,
  '42501',
  null,
  'anonymous has no company-table privilege'
);
reset role;

select * from finish();
rollback;
