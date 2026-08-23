begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'public',
  'update_cleaner_profile',
  array['text', 'text', 'text'],
  'cleaner profile updates have a narrow RPC'
);
select ok(
  (
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = 'public.update_cleaner_profile(text,text,text)'::regprocedure
  ),
  'profile update RPC is security definer'
);
select is(
  pg_get_function_result('public.update_cleaner_profile(text,text,text)'::regprocedure),
  'void'::text,
  'profile update RPC returns void'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.update_cleaner_profile(text,text,text)',
    'EXECUTE'
  )
    and has_function_privilege(
      'service_role',
      'public.update_cleaner_profile(text,text,text)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.update_cleaner_profile(text,text,text)',
      'EXECUTE'
    ),
  'only authenticated and service callers can execute profile updates'
);

select has_view(
  'public',
  'cleaner_pool_memberships',
  'cleaner memberships remain behind the dedicated cleaner view'
);
select results_eq(
  $$select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cleaner_pool_memberships'
    order by ordinal_position$$,
  $$values
    ('profile_id'::text collate "C"),
    ('company_id'::text collate "C"),
    ('company_name'::text collate "C"),
    ('status'::text collate "C")$$,
  'cleaner membership view exposes only identity, company, and membership status'
);
select ok(
  'security_barrier=true' = any(
    select unnest(coalesce(reloptions, array[]::text[]))
    from pg_class
    where oid = 'public.cleaner_pool_memberships'::regclass
  ),
  'cleaner membership view is a security barrier'
);
select ok(
  has_table_privilege('authenticated', 'public.cleaner_pool_memberships', 'SELECT')
    and has_table_privilege('service_role', 'public.cleaner_pool_memberships', 'SELECT')
    and not has_table_privilege('anon', 'public.cleaner_pool_memberships', 'SELECT'),
  'cleaner membership view has explicit grants'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.update_cleaner_profile('Anonymous Cleaner', '0400 000 000', 'Robina')$$,
  '42501',
  null,
  'an anonymous request cannot update a profile'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.update_cleaner_profile('   ', '0400 000 000', 'Robina')$$,
  '22023',
  null,
  'a blank full name is rejected'
);
select throws_ok(
  $$select public.update_cleaner_profile('Demo Cleaner One', '   ', 'Robina')$$,
  '22023',
  null,
  'a blank phone is rejected'
);
select throws_ok(
  $$select public.update_cleaner_profile('Demo Cleaner One', '0400 000 000', '   ')$$,
  '22023',
  null,
  'a blank suburb is rejected'
);
select lives_ok(
  $$select public.update_cleaner_profile('  Ana Profile  ', '  0400 111 222  ', '  Southport  ')$$,
  'a cleaner can update her own profile'
);
select results_eq(
  $$select profile_id, company_id, company_name, status::text
    from public.cleaner_pool_memberships
    order by company_name$$,
  $$values (
    '10000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000010'::uuid,
    'Coastal Demo Cleaning'::text,
    'active'::text
  )$$,
  'the view exposes only the current cleaner memberships with company names'
);
reset role;

select results_eq(
  $$select id, full_name, phone, suburb
    from public.profiles
    where id in (
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003'
    )
    order by id$$,
  $$values
    (
      '10000000-0000-4000-8000-000000000002'::uuid,
      'Ana Profile'::text,
      '0400 111 222'::text,
      'Southport'::text
    ),
    (
      '10000000-0000-4000-8000-000000000003'::uuid,
      'Demo Cleaner Two'::text,
      null::text,
      null::text
    )$$,
  'the RPC trims fields and changes only the caller profile'
);

select * from finish();
rollback;
