begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

create function pg_temp.employee_details(target_company_id uuid default null)
returns table (
  membership_id uuid,
  company_id uuid,
  profile_id uuid,
  full_name text,
  email text,
  role public.employee_role,
  joined_at timestamptz
)
language plpgsql
set search_path = ''
as $$
begin
  return query execute
    'select membership_id, company_id, profile_id, full_name::text, email::text, role, joined_at
       from public.employee_membership_details
      where ($1 is null or company_id = $1)
      order by joined_at'
    using target_company_id;
exception
  when undefined_table then
    return;
end;
$$;

select has_view(
  'public',
  'employee_membership_details',
  'owners receive one employee-list read model'
);

select columns_are(
  'public',
  'employee_membership_details',
  array[
    'membership_id',
    'company_id',
    'profile_id',
    'full_name',
    'email',
    'role',
    'joined_at'
  ],
  'employee details expose only the identity and membership fields required by S34'
);

select ok(
  coalesce(
    has_table_privilege(
      'authenticated',
      pg_catalog.to_regclass('public.employee_membership_details'),
      'SELECT'
    ),
    false
  ),
  'authenticated owners have an explicit employee-list grant'
);

select ok(
  coalesce(
    has_table_privilege(
      'service_role',
      pg_catalog.to_regclass('public.employee_membership_details'),
      'SELECT'
    ),
    false
  ),
  'service role has an explicit employee-list grant'
);

select has_function(
  'public',
  'change_employee_role',
  array['uuid', 'uuid', 'public.employee_role'],
  'owners change an employee role through one RPC'
);

select has_function(
  'public',
  'remove_employee',
  array['uuid', 'uuid'],
  'owners remove an employee through one RPC'
);

select is_definer(
  'public',
  'change_employee_role',
  array['uuid', 'uuid', 'public.employee_role'],
  'role changes own their membership write'
);

select is_definer(
  'public',
  'remove_employee',
  array['uuid', 'uuid'],
  'employee removals own their membership write'
);

select function_privs_are(
  'public',
  'change_employee_role',
  array['uuid', 'uuid', 'public.employee_role'],
  'anon',
  array[]::text[],
  'anonymous callers cannot change employee roles'
);

select function_privs_are(
  'public',
  'remove_employee',
  array['uuid', 'uuid'],
  'anon',
  array[]::text[],
  'anonymous callers cannot remove employees'
);

select function_privs_are(
  'public',
  'change_employee_role',
  array['uuid', 'uuid', 'public.employee_role'],
  'authenticated',
  array['EXECUTE'],
  'authenticated owners receive the narrow role-change capability'
);

select function_privs_are(
  'public',
  'remove_employee',
  array['uuid', 'uuid'],
  'authenticated',
  array['EXECUTE'],
  'authenticated owners receive the narrow employee-removal capability'
);

select lives_ok(
  $$insert into auth.users (
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
      ('84000000-0000-4000-8000-000000000001'::uuid, 'owner.one@cle-84.example.test', 'CLE-84 Owner One'),
      ('84000000-0000-4000-8000-000000000002'::uuid, 'owner.two@cle-84.example.test', 'CLE-84 Owner Two'),
      ('84000000-0000-4000-8000-000000000003'::uuid, 'staff@cle-84.example.test', 'CLE-84 Staff'),
      ('84000000-0000-4000-8000-000000000004'::uuid, 'sole.owner@cle-84.example.test', 'CLE-84 Sole Owner'),
      ('84000000-0000-4000-8000-000000000005'::uuid, 'removed@cle-84.example.test', 'CLE-84 Removed')
    ) as fixture(id, email, full_name);

    insert into public.companies (id, name, abn, status)
    values
      ('84000000-0000-4000-8000-000000000010', 'CLE-84 Company', '84111111111', 'approved'),
      ('84000000-0000-4000-8000-000000000020', 'CLE-84 Sole-owner Company', '84222222222', 'approved');

    insert into public.employee_memberships (
      id, company_id, profile_id, role, status, joined_at
    ) values
      ('84000000-0000-4000-8000-000000000101', '84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000001', 'owner', 'active', '2026-08-01T00:00:00+10'),
      ('84000000-0000-4000-8000-000000000102', '84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000002', 'owner', 'active', '2026-08-02T00:00:00+10'),
      ('84000000-0000-4000-8000-000000000103', '84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000003', 'staff', 'active', '2026-08-03T00:00:00+10'),
      ('84000000-0000-4000-8000-000000000104', '84000000-0000-4000-8000-000000000020', '84000000-0000-4000-8000-000000000004', 'owner', 'active', '2026-08-04T00:00:00+10'),
      ('84000000-0000-4000-8000-000000000105', '84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000005', 'staff', 'removed', '2026-07-01T00:00:00+10')$$,
  'S34 fixtures include active, removed, multi-owner, and sole-owner memberships'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select
      full_name::text collate "C",
      email::text collate "C",
      role::text collate "C",
      joined_at
    from pg_temp.employee_details('84000000-0000-4000-8000-000000000010')$$,
  $$values
    ('CLE-84 Owner One'::text collate "C", 'owner.one@cle-84.example.test'::text collate "C", 'owner'::text collate "C", '2026-08-01T00:00:00+10'::timestamptz),
    ('CLE-84 Owner Two'::text collate "C", 'owner.two@cle-84.example.test'::text collate "C", 'owner'::text collate "C", '2026-08-02T00:00:00+10'::timestamptz),
    ('CLE-84 Staff'::text collate "C", 'staff@cle-84.example.test'::text collate "C", 'staff'::text collate "C", '2026-08-03T00:00:00+10'::timestamptz)$$,
  'an owner sees active employees with name, e-mail, role, and joined date only in their company'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select count(*)::integer from pg_temp.employee_details()$$,
  $$values (0)$$,
  'staff cannot read the owner employee list'
);

select throws_ok(
  $$select public.change_employee_role(
      '84000000-0000-4000-8000-000000000010',
      '84000000-0000-4000-8000-000000000101',
      'staff'
    )$$,
  '42501',
  'Company owner access required',
  'staff cannot call the role-change RPC'
);

select throws_ok(
  $$select public.remove_employee(
      '84000000-0000-4000-8000-000000000010',
      '84000000-0000-4000-8000-000000000101'
    )$$,
  '42501',
  'Company owner access required',
  'staff cannot call the removal RPC'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.change_employee_role(
      '84000000-0000-4000-8000-000000000010',
      '84000000-0000-4000-8000-000000000103',
      'owner'
    )$$,
  'an owner can promote another employee'
);

select results_eq(
  $$select role::text collate "C" from public.employee_memberships
    where id = '84000000-0000-4000-8000-000000000103'$$,
  $$values ('owner'::text collate "C")$$,
  'the promoted role persists'
);

select lives_ok(
  $$select public.change_employee_role(
      '84000000-0000-4000-8000-000000000010',
      '84000000-0000-4000-8000-000000000101',
      'staff'
    )$$,
  'an owner can change their own role when another active owner remains'
);

select results_eq(
  $$select role::text collate "C" from public.employee_memberships
    where id = '84000000-0000-4000-8000-000000000101'$$,
  $$values ('staff'::text collate "C")$$,
  'the self-demotion persists'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.change_employee_role(
      '84000000-0000-4000-8000-000000000010',
      '84000000-0000-4000-8000-000000000101',
      'owner'
    )$$,
  'another owner can restore the caller role for the remaining removal scenarios'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.change_employee_role(
      '84000000-0000-4000-8000-000000000010',
      '84000000-0000-4000-8000-000000000102',
      'staff'
    )$$,
  'an owner can demote another owner when an active owner remains'
);

select results_eq(
  $$select role::text collate "C" from public.employee_memberships
    where id = '84000000-0000-4000-8000-000000000102'$$,
  $$values ('staff'::text collate "C")$$,
  'the demoted role persists'
);

select lives_ok(
  $$select public.remove_employee(
      '84000000-0000-4000-8000-000000000010',
      '84000000-0000-4000-8000-000000000102'
    )$$,
  'an owner can remove another employee'
);

select results_eq(
  $$select status::text collate "C", count(*)::integer
    from public.employee_memberships
    where id = '84000000-0000-4000-8000-000000000102'
    group by status$$,
  $$values ('removed'::text collate "C", 1)$$,
  'removal retains the membership row as history'
);

select lives_ok(
  $$select public.remove_employee(
      '84000000-0000-4000-8000-000000000010',
      '84000000-0000-4000-8000-000000000101'
    )$$,
  'an owner can remove themselves when another active owner remains'
);

select is(
  public.is_company_employee('84000000-0000-4000-8000-000000000010'),
  false,
  'self-removal ends company access immediately for the next request'
);

reset role;
select results_eq(
  $$select
      exists(select 1 from auth.users where id = '84000000-0000-4000-8000-000000000001'),
      exists(select 1 from public.profiles where id = '84000000-0000-4000-8000-000000000001'),
      status::text collate "C"
    from public.employee_memberships
    where id = '84000000-0000-4000-8000-000000000101'$$,
  $$values (true, true, 'removed'::text collate "C")$$,
  'self-removal keeps the account and membership history intact'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select profile_id from pg_temp.employee_details(
      '84000000-0000-4000-8000-000000000010'
    )$$,
  $$values ('84000000-0000-4000-8000-000000000003'::uuid)$$,
  'the remaining owner sees only the still-active employee'
);

select throws_ok(
  $$select public.change_employee_role(
      '84000000-0000-4000-8000-000000000020',
      '84000000-0000-4000-8000-000000000104',
      'staff'
    )$$,
  '42501',
  'Company owner access required',
  'an owner cannot manage a different company'
);

select throws_ok(
  $$select public.remove_employee(
      '84000000-0000-4000-8000-000000000010',
      '84000000-0000-4000-8000-000000000104'
    )$$,
  '22023',
  'Employee membership not found',
  'a membership identifier cannot cross the requested company boundary'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.change_employee_role(
      '84000000-0000-4000-8000-000000000020',
      '84000000-0000-4000-8000-000000000104',
      'staff'
    )$$,
  '23514',
  'Company must retain at least one active owner',
  'the last owner cannot demote themselves'
);

select throws_ok(
  $$select public.remove_employee(
      '84000000-0000-4000-8000-000000000020',
      '84000000-0000-4000-8000-000000000104'
    )$$,
  '23514',
  'Company must retain at least one active owner',
  'the last owner cannot remove themselves'
);

reset role;
select results_eq(
  $$select role::text collate "C", status::text collate "C"
    from public.employee_memberships
    where id = '84000000-0000-4000-8000-000000000104'$$,
  $$values ('owner'::text collate "C", 'active'::text collate "C")$$,
  'refused last-owner mutations leave the membership unchanged'
);

select throws_ok(
  $$delete from auth.users
    where id = '84000000-0000-4000-8000-000000000004'$$,
  '23514',
  'Company must retain at least one active owner',
  'an account cascade cannot orphan a surviving company'
);

select results_eq(
  $$select
      exists(select 1 from public.profiles where id = '84000000-0000-4000-8000-000000000004'),
      exists(select 1 from public.employee_memberships where id = '84000000-0000-4000-8000-000000000104')$$,
  $$values (true, true)$$,
  'a refused account cascade preserves both profile and owner membership'
);

select lives_ok(
  $$delete from public.companies
    where id = '84000000-0000-4000-8000-000000000020'$$,
  'deleting the tenant itself may cascade its owner membership'
);

select is(
  (select count(*)::integer from public.employee_memberships
   where id = '84000000-0000-4000-8000-000000000104'),
  0,
  'the legitimate company cascade removes the membership'
);

select * from finish();
rollback;
