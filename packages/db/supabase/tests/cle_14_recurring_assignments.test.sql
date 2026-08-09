begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

select is(
  (
    select count(*)::integer
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('recurring_assignments', 'recurring_assignment_cleaners')
  ),
  2,
  'recurring rules and named cleaner slots exist'
);
select results_eq(
  $$select enumlabel::text collate "C"
    from pg_enum
    where enumtypid = 'public.recurrence_frequency'::regtype
    order by enumsortorder$$,
  $$values
    ('weekly'::text collate "C"),
    ('fortnightly'::text collate "C")$$,
  'weekly and fortnightly frequencies are representable'
);
select is(
  (
    select count(*)::integer
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name in (
        'create_recurring_assignment',
        'update_recurring_assignment',
        'set_recurring_assignment_active'
      )
  ),
  3,
  'recurring rule mutations are exposed as three atomic RPCs'
);
select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.recurring_assignments'::regclass,
      'public.recurring_assignment_cleaners'::regclass
    )
      and relrowsecurity
  ),
  2,
  'both recurring tables have RLS enabled'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in ('recurring_assignments', 'recurring_assignment_cleaners')
  ),
  2,
  'both recurring tables have company-admin read policies'
);
select ok(
  has_table_privilege('authenticated', 'public.recurring_assignments', 'SELECT')
    and has_table_privilege(
      'authenticated',
      'public.recurring_assignment_cleaners',
      'SELECT'
    ),
  'authenticated users can read recurring rules through RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.recurring_assignments',
    'INSERT,UPDATE,DELETE'
  )
    and not has_table_privilege(
      'authenticated',
      'public.recurring_assignment_cleaners',
      'INSERT,UPDATE,DELETE'
    ),
  'authenticated writes stay behind recurring-rule RPCs'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.recurring_assignments',
    'SELECT,INSERT,UPDATE,DELETE'
  )
    and has_table_privilege(
      'service_role',
      'public.recurring_assignment_cleaners',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
  'service role has explicit recurring-rule DML grants'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_recurring_assignment(uuid,uuid,public.recurrence_frequency,smallint,date,time without time zone,integer,integer,integer,uuid[])',
    'EXECUTE'
  )
    and has_function_privilege(
      'authenticated',
      'public.update_recurring_assignment(uuid,uuid,public.recurrence_frequency,smallint,date,time without time zone,integer,integer,integer,uuid[])',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.set_recurring_assignment_active(uuid,boolean)',
      'EXECUTE'
    ),
  'authenticated callers can execute only the narrow mutation surface'
);

delete from public.job_assignments
where job_id in (
  select id from public.jobs where recurring_assignment_id is not null
);
delete from public.jobs where recurring_assignment_id is not null;
delete from public.recurring_assignments;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  (
    '21000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'tenant-b-recurring-admin@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Tenant B Recurring Admin"}', now(), now(), '', '', '', ''
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'tenant-b-recurring-cleaner@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Tenant B Recurring Cleaner"}', now(), now(), '', '', '', ''
  );
update public.profiles
set role = 'company_admin'
where id = '21000000-0000-4000-8000-000000000001';
insert into public.companies (id, name, abn, status)
values (
  '21000000-0000-4000-8000-000000000010',
  'Tenant B Recurring Demo',
  '23232323232',
  'approved'
);
insert into public.company_members (company_id, profile_id)
values
  (
    '21000000-0000-4000-8000-000000000010',
    '21000000-0000-4000-8000-000000000001'
  ),
  (
    '21000000-0000-4000-8000-000000000010',
    '21000000-0000-4000-8000-000000000002'
  );
insert into public.clients (id, company_id, name)
values (
  '21000000-0000-4000-8000-000000000301',
  '21000000-0000-4000-8000-000000000010',
  'Tenant B Recurring Client'
);
insert into public.sites (id, client_id, name, address, suburb)
values (
  '21000000-0000-4000-8000-000000000401',
  '21000000-0000-4000-8000-000000000301',
  'Tenant B Recurring Site',
  '1 Test Street',
  'Robina'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.recurring_assignments),
  0,
  'company admin starts with no recurring rules'
);
select lives_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '08:00', 180, 12000, 2,
    array['10000000-0000-4000-8000-000000000002'::uuid]
  )$$,
  'company admin can create a weekly crew-two rule with one named cleaner'
);
create temporary table cle14_rule_ids as
select id as rule_id
from public.recurring_assignments
where site_id = '10000000-0000-4000-8000-000000000401'
  and weekday = 2;
select results_eq(
  $$select frequency::text, weekday::integer, anchor_date, local_start_time,
      duration_minutes, cleaner_pay_cents, crew_size, active
    from public.recurring_assignments
    where id = (select rule_id from cle14_rule_ids)$$,
  $$values (
    'weekly'::text, 2, '2026-08-11'::date, '08:00'::time,
    180, 12000, 2, true
  )$$,
  'the weekly rule persists one weekday and its complete schedule contract'
);
select results_eq(
  $$select slot_number, cleaner_id
    from public.recurring_assignment_cleaners
    where recurring_assignment_id = (select rule_id from cle14_rule_ids)
    order by slot_number$$,
  $$values (1, '10000000-0000-4000-8000-000000000002'::uuid)$$,
  'named cleaners persist in contiguous one-based slot order'
);
select is(
  (
    select crew_size - count(named.cleaner_id)::integer
    from public.recurring_assignments rule
    left join public.recurring_assignment_cleaners named
      on named.recurring_assignment_id = rule.id
    where rule.id = (select rule_id from cle14_rule_ids)
    group by rule.crew_size
  ),
  1,
  'the crew-two rule retains one open slot'
);
select lives_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000402',
    '30000000-0000-4000-8000-000000000001',
    'fortnightly', 3::smallint, '2026-08-12', '17:30', 90, 9500, 1,
    array[]::uuid[]
  )$$,
  'company admin can create a fortnightly unnamed rule'
);
select results_eq(
  $$select site_id, frequency::text, weekday::integer, anchor_date
    from public.recurring_assignments
    order by weekday$$,
  $$values
    (
      '10000000-0000-4000-8000-000000000401'::uuid,
      'weekly'::text, 2, '2026-08-11'::date
    ),
    (
      '10000000-0000-4000-8000-000000000402'::uuid,
      'fortnightly'::text, 3, '2026-08-12'::date
    )$$,
  'weekly and fortnightly rows keep independent single-weekday anchors'
);
select throws_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '10:00', 60, 8000, 1,
    array[
      '10000000-0000-4000-8000-000000000002'::uuid,
      '10000000-0000-4000-8000-000000000003'::uuid
    ]
  )$$,
  '23514',
  'Named cleaner count cannot exceed crew size',
  'named cleaner count cannot exceed crew size'
);
select is(
  (select count(*)::integer from public.recurring_assignments),
  2,
  'an over-capacity create leaves existing rules unchanged'
);
select throws_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '10:00', 60, 8000, 2,
    array[
      '10000000-0000-4000-8000-000000000002'::uuid,
      '10000000-0000-4000-8000-000000000002'::uuid
    ]
  )$$,
  '23505',
  'Named cleaner list cannot contain duplicates',
  'duplicate named cleaners are rejected'
);
select throws_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '10:00', 60, 8000, 1,
    array['10000000-0000-4000-8000-000000000005'::uuid]
  )$$,
  '23514',
  'Named cleaners must be active pool members of the site company',
  'a removed cleaner cannot be named'
);
select throws_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '10:00', 60, 8000, 1,
    array['21000000-0000-4000-8000-000000000002'::uuid]
  )$$,
  '23514',
  'Named cleaners must be active pool members of the site company',
  'a cleaner from another company cannot be named'
);
select throws_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '10:00', 60, 8000, 1,
    array['10000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  '23514',
  'Named cleaners must be active pool members of the site company',
  'a company admin cannot fill a named cleaner slot'
);
select throws_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '10:00', 60, 8000, 1,
    null::uuid[]
  )$$,
  '23514',
  'Named cleaner list is required',
  'a null named-cleaner list is rejected'
);
select throws_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-12', '10:00', 60, 8000, 1,
    array[]::uuid[]
  )$$,
  '23514',
  null,
  'the anchor date must fall on the rule weekday'
);
select lives_ok(
  $$select public.update_recurring_assignment(
    (select rule_id from cle14_rule_ids),
    '30000000-0000-4000-8000-000000000001',
    'fortnightly', 4::smallint, '2026-08-13', '09:15', 90, 10500, 1,
    array['10000000-0000-4000-8000-000000000004'::uuid]
  )$$,
  'company admin can atomically edit the rule and shrink its named slots'
);
select results_eq(
  $$select frequency::text, weekday::integer, anchor_date, local_start_time,
      duration_minutes, cleaner_pay_cents, crew_size
    from public.recurring_assignments
    where id = (select rule_id from cle14_rule_ids)$$,
  $$values (
    'fortnightly'::text, 4, '2026-08-13'::date, '09:15'::time,
    90, 10500, 1
  )$$,
  'editing persists the canonical scalar rule values'
);
select results_eq(
  $$select slot_number, cleaner_id
    from public.recurring_assignment_cleaners
    where recurring_assignment_id = (select rule_id from cle14_rule_ids)$$,
  $$values (1, '10000000-0000-4000-8000-000000000004'::uuid)$$,
  'editing replaces the complete named-cleaner order'
);
select throws_ok(
  $$select public.update_recurring_assignment(
    (select rule_id from cle14_rule_ids),
    '30000000-0000-4000-8000-000000000002',
    'weekly', 5::smallint, '2026-08-14', '11:00', 60, 7000, 2,
    array[
      '10000000-0000-4000-8000-000000000002'::uuid,
      '10000000-0000-4000-8000-000000000002'::uuid
    ]
  )$$,
  '23505',
  'Named cleaner list cannot contain duplicates',
  'an invalid replacement is rejected before mutation'
);
select results_eq(
  $$select weekday::integer, local_start_time, crew_size,
      (select array_agg(named.cleaner_id order by named.slot_number)
       from public.recurring_assignment_cleaners named
       where named.recurring_assignment_id = rule.id)
    from public.recurring_assignments rule
    where id = (select rule_id from cle14_rule_ids)$$,
  $$values (
    4, '09:15'::time, 1,
    array['10000000-0000-4000-8000-000000000004'::uuid]
  )$$,
  'a rejected replacement leaves the complete prior rule unchanged'
);
select lives_ok(
  $$select public.set_recurring_assignment_active(
    (select rule_id from cle14_rule_ids), false
  )$$,
  'company admin can toggle a recurring rule inactive'
);
select is(
  (
    select active
    from public.recurring_assignments
    where id = (select rule_id from cle14_rule_ids)
  ),
  false,
  'inactive state persists without deleting the rule'
);

select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_recurring_assignment(
    '21000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '07:00', 60, 8000, 1,
    array['21000000-0000-4000-8000-000000000002'::uuid]
  )$$,
  'another company admin can create a rule for their own site'
);
select is(
  (select count(*)::integer from public.recurring_assignments),
  1,
  'another company admin reads only their own recurring rule'
);
select throws_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '07:00', 60, 8000, 1,
    array['21000000-0000-4000-8000-000000000002'::uuid]
  )$$,
  '42501',
  'Only an active company admin can create recurring assignments',
  'a company admin cannot create a rule for another company'
);
select throws_ok(
  $$select public.update_recurring_assignment(
    (select rule_id from cle14_rule_ids),
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '07:00', 60, 8000, 1,
    array[]::uuid[]
  )$$,
  '42501',
  'Only an active company admin can update recurring assignments',
  'a company admin cannot edit another company rule'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::integer from public.recurring_assignments),
  0,
  'a cleaner cannot read recurring assignment rules'
);
select is(
  (select count(*)::integer from public.recurring_assignment_cleaners),
  0,
  'a cleaner cannot read named recurring slots'
);
select throws_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '07:00', 60, 8000, 1,
    array[]::uuid[]
  )$$,
  '42501',
  'Only an active company admin can create recurring assignments',
  'a cleaner cannot create a recurring assignment'
);
select throws_ok(
  $$select public.set_recurring_assignment_active(
    (select rule_id from cle14_rule_ids), true
  )$$,
  '42501',
  'Only an active company admin can change recurring assignments',
  'a cleaner cannot toggle a recurring assignment'
);

reset role;
select is(
  (select count(*)::integer from public.recurring_assignments),
  3,
  'all accepted rules remain intact after denied cross-role mutations'
);

update public.company_members
set status = 'removed'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '10000000-0000-4000-8000-000000000004';
select is(
  (
    select count(*)::integer
    from public.recurring_assignment_cleaners
    where cleaner_id = '10000000-0000-4000-8000-000000000004'
  ),
  0,
  'removing a pool member converts their named recurring slots back to open slots'
);
update public.company_members
set status = 'active'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '10000000-0000-4000-8000-000000000004';
insert into public.recurring_assignment_cleaners (
  recurring_assignment_id,
  slot_number,
  cleaner_id
) values (
  (select rule_id from cle14_rule_ids),
  1,
  '10000000-0000-4000-8000-000000000004'
)
on conflict (recurring_assignment_id, slot_number) do update
set cleaner_id = excluded.cleaner_id;
update public.profiles
set role = 'company_admin'
where id = '10000000-0000-4000-8000-000000000004';
select is(
  (
    select count(*)::integer
    from public.recurring_assignment_cleaners
    where cleaner_id = '10000000-0000-4000-8000-000000000004'
  ),
  0,
  'changing a profile out of the cleaner role opens its named recurring slots'
);

select * from finish();
rollback;
