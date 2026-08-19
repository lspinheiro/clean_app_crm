begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select ok(
  to_regclass('public.site_preferred_cleaners') is not null,
  'site preferred cleaners table exists'
);
select is(
  (
    select count(*)::integer
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'site_preferred_cleaners'
      and constraint_name in (
        'site_preferred_cleaners_pkey',
        'site_preferred_cleaners_site_id_rank_key',
        'site_preferred_cleaners_rank_check'
      )
  ),
  3,
  'preferred cleaners constrain uniqueness and positive rank'
);
select is(
  (
    select count(*)::integer
    from information_schema.routines
    where routine_schema = 'public' and routine_name = 'set_site_preferred_cleaners'
  ),
  1,
  'preference replacement exists as one transactional RPC'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public' and tablename = 'site_preferred_cleaners'
  ),
  1,
  'preferred cleaners have an admin-only read policy'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.site_preferred_cleaners'::regclass),
  'preferred cleaners have RLS enabled'
);
select ok(
  has_table_privilege('authenticated', 'public.site_preferred_cleaners', 'SELECT'),
  'authenticated users can read preferences through RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.site_preferred_cleaners',
    'INSERT,UPDATE,DELETE'
  ),
  'authenticated preference writes stay behind the replacement RPC'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.site_preferred_cleaners',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service role has explicit preference DML grants'
);
select throws_ok(
  $$insert into public.site_preferred_cleaners (site_id, cleaner_id, rank)
    values (
      '10000000-0000-4000-8000-000000000401',
      '10000000-0000-4000-8000-000000000002',
      0
    )$$,
  '23514',
  null,
  'a preferred cleaner rank must be positive'
);

delete from public.site_preferred_cleaners;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'tenant-b-preferences-admin@example.test',
  crypt('local-test-only', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Tenant B Preferences Admin"}', now(), now(), '', '', '', ''
);
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '20000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'tenant-b-cleaner@example.test',
  crypt('local-test-only', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Tenant B Cleaner"}', now(), now(), '', '', '', ''
);
insert into public.companies (id, name, abn, status)
values (
  '20000000-0000-4000-8000-000000000010',
  'Tenant B Preferences Demo',
  '22222222222',
  'approved'
);
insert into public.employee_memberships (company_id, profile_id, role)
values (
  '20000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000001',
  'owner'
);
insert into public.company_members (company_id, profile_id)
values (
  '20000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.site_preferred_cleaners),
  0,
  'company admin starts with no preferred cleaners'
);
select lives_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array[
      '10000000-0000-4000-8000-000000000002'::uuid,
      '10000000-0000-4000-8000-000000000003'::uuid,
      '10000000-0000-4000-8000-000000000004'::uuid
    ]
  )$$,
  'company admin can save three active pool cleaners'
);
select results_eq(
  $$select profile.full_name, preference.rank
    from public.site_preferred_cleaners preference
    join public.profiles profile on profile.id = preference.cleaner_id
    where preference.site_id = '10000000-0000-4000-8000-000000000401'
    order by preference.rank$$,
  $$values
    ('Demo Cleaner One'::text, 1),
    ('Demo Cleaner Two'::text, 2),
    ('Demo Cleaner Three'::text, 3)$$,
  'the saved order uses contiguous one-based ranks'
);
select lives_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array[
      '10000000-0000-4000-8000-000000000004'::uuid,
      '10000000-0000-4000-8000-000000000002'::uuid,
      '10000000-0000-4000-8000-000000000003'::uuid
    ]
  )$$,
  'company admin can replace the complete order'
);
select results_eq(
  $$select profile.full_name
    from public.site_preferred_cleaners preference
    join public.profiles profile on profile.id = preference.cleaner_id
    where preference.site_id = '10000000-0000-4000-8000-000000000401'
    order by preference.rank$$,
  array['Demo Cleaner Three', 'Demo Cleaner One', 'Demo Cleaner Two']::text[],
  'replacement persists the requested order'
);
select lives_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array[
      '10000000-0000-4000-8000-000000000004'::uuid,
      '10000000-0000-4000-8000-000000000003'::uuid
    ]
  )$$,
  'company admin can remove a preferred cleaner'
);
select results_eq(
  $$select profile.full_name, preference.rank
    from public.site_preferred_cleaners preference
    join public.profiles profile on profile.id = preference.cleaner_id
    where preference.site_id = '10000000-0000-4000-8000-000000000401'
    order by preference.rank$$,
  $$values ('Demo Cleaner Three'::text, 1), ('Demo Cleaner Two'::text, 2)$$,
  'removal closes the rank gap'
);
select throws_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array[
      '10000000-0000-4000-8000-000000000004'::uuid,
      '10000000-0000-4000-8000-000000000004'::uuid
    ]
  )$$,
  '23505',
  'Preferred cleaner list cannot contain duplicates',
  'duplicate cleaners are rejected'
);
select results_eq(
  $$select cleaner_id from public.site_preferred_cleaners
    where site_id = '10000000-0000-4000-8000-000000000401' order by rank$$,
  array[
    '10000000-0000-4000-8000-000000000004'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid
  ],
  'a duplicate submission leaves the prior order intact'
);
select throws_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    null::uuid[]
  )$$,
  '23514',
  'Preferred cleaner list is required',
  'a null list is rejected instead of being treated as clear'
);
select results_eq(
  $$select cleaner_id from public.site_preferred_cleaners
    where site_id = '10000000-0000-4000-8000-000000000401' order by rank$$,
  array[
    '10000000-0000-4000-8000-000000000004'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid
  ],
  'a null submission leaves the prior order intact'
);
select throws_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array['10000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  '23514',
  'Every preferred cleaner must be an active pool cleaner',
  'the company admin profile is not eligible as a preferred cleaner'
);
select results_eq(
  $$select cleaner_id from public.site_preferred_cleaners
    where site_id = '10000000-0000-4000-8000-000000000401' order by rank$$,
  array[
    '10000000-0000-4000-8000-000000000004'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid
  ],
  'an ineligible profile submission leaves the prior order intact'
);
select throws_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array['20000000-0000-4000-8000-000000000002'::uuid]
  )$$,
  '23514',
  'Every preferred cleaner must be an active pool cleaner',
  'an active cleaner from another company is not eligible'
);
select results_eq(
  $$select cleaner_id from public.site_preferred_cleaners
    where site_id = '10000000-0000-4000-8000-000000000401' order by rank$$,
  array[
    '10000000-0000-4000-8000-000000000004'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid
  ],
  'a foreign cleaner submission leaves the prior order intact'
);
reset role;

update public.company_members
set status = 'removed'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '10000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array[
      '10000000-0000-4000-8000-000000000004'::uuid,
      '10000000-0000-4000-8000-000000000002'::uuid
    ]
  )$$,
  '23514',
  'Every preferred cleaner must be an active pool cleaner',
  'a removed pool member is not eligible'
);
select results_eq(
  $$select cleaner_id from public.site_preferred_cleaners
    where site_id = '10000000-0000-4000-8000-000000000401' order by rank$$,
  array[
    '10000000-0000-4000-8000-000000000004'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid
  ],
  'a removed-member submission leaves the prior order intact'
);
reset role;

update public.company_members
set status = 'active'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '10000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array[]::uuid[]
  )$$,
  'an empty list explicitly clears preferences'
);
select is(
  (select count(*)::integer from public.site_preferred_cleaners),
  0,
  'clearing leaves no preferred cleaners'
);
select lives_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array[
      '10000000-0000-4000-8000-000000000002'::uuid,
      '10000000-0000-4000-8000-000000000003'::uuid
    ]
  )$$,
  'company admin can restore a valid order'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.site_preferred_cleaners),
  0,
  'another company admin cannot read foreign preferences'
);
select throws_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array['10000000-0000-4000-8000-000000000004'::uuid]
  )$$,
  '42501',
  'Company admin access required',
  'another company admin cannot replace foreign preferences'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.site_preferred_cleaners),
  0,
  'cleaner cannot read site preferences'
);
select throws_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array['10000000-0000-4000-8000-000000000004'::uuid]
  )$$,
  '42501',
  'Company admin access required',
  'cleaner cannot replace site preferences'
);
reset role;

select results_eq(
  $$select cleaner_id from public.site_preferred_cleaners
    where site_id = '10000000-0000-4000-8000-000000000401' order by rank$$,
  array[
    '10000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid
  ],
  'failed foreign and cleaner mutations leave the valid order intact'
);

select * from finish();
rollback;
