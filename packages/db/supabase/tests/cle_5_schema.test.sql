begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_type('public', 'app_role', 'app_role enum exists');
select is(
  (
    select e.enumlabel::text
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role'
    order by e.enumsortorder
    limit 1
  ),
  'company_admin',
  'company_admin is the first canonical role'
);
select is(
  (
    select string_agg(e.enumlabel::text, ',' order by e.enumsortorder)
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role'
  ),
  'company_admin,cleaner,admin',
  'app_role uses only canonical vocabulary'
);
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'companies', 'companies exists');
select has_table('public', 'company_members', 'company_members exists');
select has_table('public', 'company_invites', 'company_invites exists');
select has_column('public', 'companies', 'abn', 'companies carries ABN');
select col_not_null('public', 'companies', 'abn', 'company ABN is required');
select has_column('public', 'company_members', 'profile_id', 'membership belongs to a profile');
select has_column('public', 'company_invites', 'code', 'invite carries a code');
select results_eq(
  $$select relrowsecurity from pg_class where oid = 'public.profiles'::regclass$$,
  array[true],
  'profiles has RLS enabled'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid = 'public.companies'::regclass$$,
  array[true],
  'companies has RLS enabled'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid = 'public.company_members'::regclass$$,
  array[true],
  'company_members has RLS enabled'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid = 'public.company_invites'::regclass$$,
  array[true],
  'company_invites has RLS enabled'
);
select throws_ok(
  $$insert into public.profiles (id, role, full_name) values (gen_random_uuid(), 'legacy_role', 'Invalid')$$,
  '22P02',
  null,
  'invalid roles are rejected'
);
select throws_ok(
  $$insert into public.companies (name) values ('Missing ABN')$$,
  '23502',
  null,
  'companies without an ABN are rejected'
);

select * from finish();
rollback;
