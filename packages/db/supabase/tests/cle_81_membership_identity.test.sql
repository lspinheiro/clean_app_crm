begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

select has_type(
  'public',
  'employee_role',
  'employee roles have a membership-local enum'
);

select results_eq(
  $$select enum_value.enumlabel::text collate "C"
    from pg_catalog.pg_type enum_type
    join pg_catalog.pg_namespace namespace on namespace.oid = enum_type.typnamespace
    join pg_catalog.pg_enum enum_value on enum_value.enumtypid = enum_type.oid
    where namespace.nspname = 'public'
      and enum_type.typname = 'employee_role'
    order by enum_value.enumsortorder$$,
  $$values ('owner'::text collate "C"), ('staff'::text collate "C")$$,
  'employee memberships expose only owner and staff roles'
);

select has_table(
  'public',
  'employee_memberships',
  'employee memberships are separate from pool memberships'
);

select has_view(
  'public',
  'cleaner_pool_memberships',
  'cleaner membership detection has a dedicated privacy-boundary view'
);

select hasnt_column(
  'public',
  'profiles',
  'role',
  'profiles carry no global product role'
);

select is(
  pg_catalog.to_regprocedure('public.current_app_role()'),
  null::regprocedure,
  'the global-role helper is removed'
);

select results_eq(
  $$select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'employee_memberships'
    order by ordinal_position$$,
  $$values
    ('id'::text collate "C"),
    ('company_id'::text collate "C"),
    ('profile_id'::text collate "C"),
    ('role'::text collate "C"),
    ('status'::text collate "C"),
    ('joined_at'::text collate "C")$$,
  'employee memberships keep identity, company role, lifecycle, and history'
);

select ok(
  coalesce(
    (
      select relation.relrowsecurity
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'employee_memberships'
    ),
    false
  ),
  'employee memberships enforce RLS'
);

select ok(
  coalesce(
    has_table_privilege(
      'authenticated',
      pg_catalog.to_regclass('public.employee_memberships'),
      'SELECT'
    ),
    false
  ),
  'authenticated accounts have an explicit employee-membership read grant'
);

select ok(
  not coalesce(
    has_table_privilege(
      'authenticated',
      pg_catalog.to_regclass('public.employee_memberships'),
      'INSERT,UPDATE,DELETE'
    ),
    false
  ),
  'authenticated accounts cannot mutate employee memberships directly'
);

select ok(
  coalesce(
    has_table_privilege(
      'service_role',
      pg_catalog.to_regclass('public.employee_memberships'),
      'SELECT,INSERT,UPDATE,DELETE'
    ),
    false
  ),
  'service role has explicit employee-membership DML grants'
);

select has_function(
  'public',
  'is_company_employee',
  array['uuid'],
  'company-side authority has a membership helper'
);

select has_function(
  'public',
  'is_company_owner',
  array['uuid'],
  'owner-only authority has a membership helper'
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
  ('81000000-0000-4000-8000-000000000001'::uuid, 'owner@cle-81.example.test', 'CLE-81 Owner'),
  ('81000000-0000-4000-8000-000000000002'::uuid, 'staff@cle-81.example.test', 'CLE-81 Staff'),
  ('81000000-0000-4000-8000-000000000003'::uuid, 'other.owner@cle-81.example.test', 'CLE-81 Other Owner'),
  ('81000000-0000-4000-8000-000000000004'::uuid, 'removed@cle-81.example.test', 'CLE-81 Removed Employee'),
  ('81000000-0000-4000-8000-000000000005'::uuid, 'pool.only@cle-81.example.test', 'CLE-81 Pool Only'),
  ('81000000-0000-4000-8000-000000000006'::uuid, 'founder.pool@cle-81.example.test', 'CLE-81 Invited Founder')
) as fixture(id, email, full_name);

insert into public.companies (id, name, abn, status)
values
  ('81000000-0000-4000-8000-000000000010', 'CLE-81 Employee Company', '81111111111', 'approved'),
  ('81000000-0000-4000-8000-000000000020', 'CLE-81 Pool Company', '82222222222', 'approved');

insert into public.company_members (company_id, profile_id, status)
values
  (
    '81000000-0000-4000-8000-000000000020',
    '81000000-0000-4000-8000-000000000001',
    'active'
  ),
  (
    '81000000-0000-4000-8000-000000000020',
    '81000000-0000-4000-8000-000000000005',
    'active'
  ),
  (
    '81000000-0000-4000-8000-000000000020',
    '81000000-0000-4000-8000-000000000006',
    'active'
  ),
  (
    '81000000-0000-4000-8000-000000000020',
    '81000000-0000-4000-8000-000000000004',
    'removed'
  );

insert into public.clients (id, company_id, name, phone, notes)
values (
  '81000000-0000-4000-8000-000000000301',
  '81000000-0000-4000-8000-000000000020',
  'CLE-81 Private Client',
  '07 5555 8181',
  'Internal notes remain company-only'
);

insert into public.sites (id, client_id, name, address, suburb, access_notes)
values (
  '81000000-0000-4000-8000-000000000401',
  '81000000-0000-4000-8000-000000000301',
  'CLE-81 Private Site',
  '81 Private Street',
  'Robina',
  'Private access notes'
);

insert into public.jobs (
  id,
  site_id,
  service_id,
  scheduled_start,
  duration_minutes,
  cleaner_pay_cents,
  client_charge_cents,
  status,
  crew_size
)
values (
  '81000000-0000-4000-8000-000000000501',
  '81000000-0000-4000-8000-000000000401',
  '30000000-0000-4000-8000-000000000002',
  now() + interval '1 day',
  60,
  8000,
  12000,
  'posted',
  1
);

select lives_ok(
  $$insert into public.employee_memberships (
      company_id,
      profile_id,
      role,
      status
    )
    values
      (
        '81000000-0000-4000-8000-000000000010',
        '81000000-0000-4000-8000-000000000001',
        'owner',
        'active'
      ),
      (
        '81000000-0000-4000-8000-000000000010',
        '81000000-0000-4000-8000-000000000002',
        'staff',
        'active'
      ),
      (
        '81000000-0000-4000-8000-000000000010',
        '81000000-0000-4000-8000-000000000004',
        'staff',
        'removed'
      ),
      (
        '81000000-0000-4000-8000-000000000020',
        '81000000-0000-4000-8000-000000000003',
        'owner',
        'active'
      )$$,
  'one account can hold employee and pool memberships across companies'
);

select results_eq(
  $$select role::text collate "C", status::text collate "C"
    from public.employee_memberships
    where company_id = '81000000-0000-4000-8000-000000000010'
    order by profile_id$$,
  $$values
    ('owner'::text collate "C", 'active'::text collate "C"),
    ('staff'::text collate "C", 'active'::text collate "C"),
    ('staff'::text collate "C", 'removed'::text collate "C")$$,
  'employee role and active lifecycle live on each membership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select
      public.is_company_employee('81000000-0000-4000-8000-000000000010'),
      public.is_company_owner('81000000-0000-4000-8000-000000000010')$$,
  $$values (true, true)$$,
  'an active owner membership grants company and owner authority'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select
      public.is_company_employee('81000000-0000-4000-8000-000000000010'),
      public.is_company_owner('81000000-0000-4000-8000-000000000010')$$,
  $$values (true, false)$$,
  'an active staff membership grants operational but not owner authority'
);

select lives_ok(
  $$select public.create_client(
    '81000000-0000-4000-8000-000000000010',
    'CLE-81 Staff-created Client',
    null,
    null,
    null
  )$$,
  'an active staff membership grants operational RPC authority'
);

select throws_ok(
  $$select public.update_company_identity(
    '81000000-0000-4000-8000-000000000010',
    'Staff Must Not Rename',
    '81111111111',
    null
  )$$,
  '42501',
  'Company admin access required',
  'an active staff membership does not grant owner-only company settings authority'
);

select throws_ok(
  $$update public.companies
    set name = 'Staff Direct Rename'
    where id = '81000000-0000-4000-8000-000000000010'$$,
  '42501',
  'permission denied for table companies',
  'table grants refuse a staff member who bypasses the owner-only settings RPC'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select
      public.is_company_employee('81000000-0000-4000-8000-000000000020'),
      public.is_company_owner('81000000-0000-4000-8000-000000000020')$$,
  $$values (false, false)$$,
  'a pool membership never grants company-side authority'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select
      public.is_company_employee('81000000-0000-4000-8000-000000000010'),
      public.is_company_owner('81000000-0000-4000-8000-000000000010')$$,
  $$values (false, false)$$,
  'a removed employee membership grants no authority'
);
reset role;

select throws_ok(
  $$update public.employee_memberships
    set role = 'staff'
    where company_id = '81000000-0000-4000-8000-000000000010'
      and profile_id = '81000000-0000-4000-8000-000000000001'$$,
  '23514',
  'Company must retain at least one active owner',
  'the last owner cannot be demoted'
);

select throws_ok(
  $$update public.employee_memberships
    set status = 'removed'
    where company_id = '81000000-0000-4000-8000-000000000010'
      and profile_id = '81000000-0000-4000-8000-000000000001'$$,
  '23514',
  'Company must retain at least one active owner',
  'the last owner cannot be deactivated'
);

select throws_ok(
  $$delete from public.employee_memberships
    where company_id = '81000000-0000-4000-8000-000000000010'
      and profile_id = '81000000-0000-4000-8000-000000000001'$$,
  '23514',
  'Company must retain at least one active owner',
  'the last owner cannot be deleted'
);

select lives_ok(
  $$insert into public.employee_memberships (company_id, profile_id, role, status)
    values (
      '81000000-0000-4000-8000-000000000010',
      '81000000-0000-4000-8000-000000000003',
      'owner',
      'active'
    );
    update public.employee_memberships
    set role = 'staff'
    where company_id = '81000000-0000-4000-8000-000000000010'
      and profile_id = '81000000-0000-4000-8000-000000000001'$$,
  'an owner can be demoted when another active owner remains'
);

select results_eq(
  $$select role::text collate "C"
    from public.employee_memberships
    where company_id = '81000000-0000-4000-8000-000000000010'
      and status = 'active'
    order by profile_id$$,
  $$values
    ('staff'::text collate "C"),
    ('staff'::text collate "C"),
    ('owner'::text collate "C")$$,
  'the allowed demotion persists while one active owner remains'
);

insert into public.first_admin_invitations (
  id,
  email,
  locale,
  invited_by,
  expires_at
)
values (
  '81000000-0000-4000-8000-000000000700',
  'founder.pool@cle-81.example.test',
  'en-AU',
  'CLE-81 test founder',
  now() + interval '1 day'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.accept_first_admin_invitation(
    'CLE-81 Invited Founder',
    'CLE-81 Founder Company',
    '83333333333',
    '0400 000 081',
    'en-AU'
  )$$,
  'founder acceptance atomically creates an owner membership for an existing pool member'
);
reset role;

select results_eq(
  $$select
      company.status::text collate "C",
      membership.role::text collate "C",
      membership.status::text collate "C"
    from public.first_admin_invitations invitation
    join public.companies company on company.id = invitation.company_id
    join public.employee_memberships membership
      on membership.company_id = company.id
      and membership.profile_id = invitation.accepted_by_profile_id
    where invitation.id = '81000000-0000-4000-8000-000000000700'$$,
  $$values (
    'approved'::text collate "C",
    'owner'::text collate "C",
    'active'::text collate "C"
  )$$,
  'the accepted founder owns the new approved company'
);

select is(
  (
    select count(*)::integer
    from public.company_members
    where company_id = '81000000-0000-4000-8000-000000000020'
      and profile_id = '81000000-0000-4000-8000-000000000006'
      and status = 'active'
  ),
  1,
  'founder acceptance preserves the account pool membership'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cleaner_job_board'
      and column_name in (
        'address',
        'access_notes',
        'client_phone',
        'client_charge_cents',
        'internal_notes'
      )
  ),
  0,
  'the cleaner board exposes no address, access notes, client phone, charge, or internal notes'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cleaner_my_jobs'
      and column_name in (
        'address',
        'access_notes',
        'client_phone',
        'client_charge_cents',
        'internal_notes'
      )
  ),
  0,
  'the cleaner jobs view keeps private details behind the assigned-access RPC'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and (
        procedure.prosrc like '%profile.role%'
        or procedure.prosrc like '%caller.role%'
        or procedure.prosrc like '%current_app_role%'
      )
  ),
  0,
  'public functions contain no global product-role authorisation checks'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_views view_definition
    where view_definition.schemaname = 'public'
      and view_definition.definition like '%profile.role%'
  ),
  0,
  'public views contain no global product-role filters'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.clients),
  0,
  'a pool-only account cannot select raw client rows'
);
select is(
  (select count(*)::integer from public.sites),
  0,
  'a pool-only account cannot select raw site rows'
);
select is(
  (select count(*)::integer from public.employee_memberships),
  0,
  'a pool-only account cannot select employee memberships'
);
select is(
  (select count(*)::integer from public.cleaner_pool_memberships),
  1,
  'a pool-only account can detect its own active membership through a dedicated cleaner view'
);
select throws_ok(
  $$select * from public.get_cleaner_job_access(
    '81000000-0000-4000-8000-000000000501'
  )$$,
  '42501',
  'Job access is unavailable',
  'an unassigned pool member cannot read a site address or access notes'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.cleaner_pool_memberships),
  1,
  'a removed pool member can detect its existing membership through the cleaner view'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.site_access_log
    where job_id = '81000000-0000-4000-8000-000000000501'
  ),
  0,
  'a refused private-detail read leaves no access-log entry'
);

select is(
  (
    select count(*)::integer
    from public.employee_memberships employee
    join public.company_members pool on pool.profile_id = employee.profile_id
    where employee.profile_id = '10000000-0000-4000-8000-000000000001'
      and employee.status = 'active'
      and pool.status = 'active'
      and employee.company_id <> pool.company_id
  ),
  1,
  'demo seed has one login with employee and pool memberships in different companies'
);

select * from finish();
rollback;
