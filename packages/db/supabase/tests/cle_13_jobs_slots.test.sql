begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

select is(
  (
    select count(*)::integer
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('jobs', 'job_assignments')
  ),
  2,
  'jobs and per-slot assignments exist'
);
select ok(to_regclass('public.vacancies') is not null, 'the vacancy projection exists');
select results_eq(
  $$select enumlabel::text collate "C"
    from pg_enum
    where enumtypid = 'public.job_status'::regtype
    order by enumsortorder$$,
  $$values
    ('draft'::text collate "C"),
    ('posted'::text collate "C"),
    ('assigned'::text collate "C"),
    ('on_the_way'::text collate "C"),
    ('in_progress'::text collate "C"),
    ('completed'::text collate "C"),
    ('cancelled'::text collate "C")$$,
  'jobs use the operational status lifecycle'
);
select is(
  (
    select count(*)::integer
    from pg_class
    where oid in ('public.jobs'::regclass, 'public.job_assignments'::regclass)
      and relrowsecurity
  ),
  2,
  'jobs and assignments have RLS enabled'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in ('jobs', 'job_assignments')
  ),
  2,
  'jobs and assignments each expose one company-admin read policy'
);
select ok(
  has_table_privilege('authenticated', 'public.jobs', 'SELECT')
    and has_table_privilege('authenticated', 'public.job_assignments', 'SELECT'),
  'authenticated users can read jobs and assignments through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.jobs', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege(
      'authenticated',
      'public.job_assignments',
      'INSERT,UPDATE,DELETE'
    ),
  'authenticated job writes stay behind future narrow RPCs'
);
select ok(
  has_table_privilege('service_role', 'public.jobs', 'SELECT,INSERT,UPDATE,DELETE')
    and has_table_privilege(
      'service_role',
      'public.job_assignments',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
  'service role has explicit job and assignment DML grants'
);
select ok(
  has_table_privilege('authenticated', 'public.vacancies', 'SELECT')
    and has_table_privilege('service_role', 'public.vacancies', 'SELECT'),
  'the vacancy projection has explicit read grants'
);
select ok(
  coalesce(
    (select reloptions @> array['security_invoker=true']
      from pg_class
      where oid = 'public.vacancies'::regclass),
    false
  ),
  'the vacancy projection honours caller RLS'
);

delete from public.notifications where ledger_entry_id is not null;
delete from public.ledger_entries;
delete from public.job_assignments;
delete from public.jobs;
delete from public.site_preferred_cleaners
where site_id = '10000000-0000-4000-8000-000000000401';
insert into public.site_preferred_cleaners (site_id, cleaner_id, rank)
values
  (
    '10000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000002',
    1
  ),
  (
    '10000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000003',
    2
  );

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  (
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'tenant-b-jobs-admin@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Tenant B Jobs Admin"}', now(), now(), '', '', '', ''
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'tenant-b-jobs-cleaner@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Tenant B Jobs Cleaner"}', now(), now(), '', '', '', ''
  );
update public.profiles
set role = 'company_admin'
where id = '20000000-0000-4000-8000-000000000001';
insert into public.companies (id, name, abn, status)
values ('20000000-0000-4000-8000-000000000010', 'Tenant B Jobs Demo', '22222222222', 'approved');
insert into public.company_members (company_id, profile_id)
values
  ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000002');
insert into public.clients (id, company_id, name)
values ('20000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000010', 'Tenant B Client');
insert into public.sites (id, client_id, name, address, suburb)
values (
  '20000000-0000-4000-8000-000000000401',
  '20000000-0000-4000-8000-000000000301',
  'Tenant B Site',
  '1 Test Street',
  'Robina'
);

select throws_ok(
  $$insert into public.jobs (
      site_id, service_id, scheduled_start, duration_minutes,
      cleaner_pay_cents, status, crew_size
    ) values (
      '10000000-0000-4000-8000-000000000401',
      '30000000-0000-4000-8000-000000000002',
      '2026-08-10T08:00:00+10', 120, 12000, 'posted', 0
    )$$,
  '23514',
  null,
  'crew size must be at least one'
);

insert into public.jobs (
  id, site_id, service_id, scheduled_start, duration_minutes,
  cleaner_pay_cents, status, crew_size
) values (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000401',
  '30000000-0000-4000-8000-000000000002',
  '2026-08-10T08:00:00+10',
  120,
  12000,
  'posted',
  2
);
insert into public.job_assignments (job_id, slot_number, cleaner_id)
values (
  '40000000-0000-4000-8000-000000000001',
  1,
  '10000000-0000-4000-8000-000000000002'
);

select is(
  (select count(*)::integer from public.vacancies where job_id = '40000000-0000-4000-8000-000000000001'),
  1,
  'a crew-two job with one assignment has exactly one vacancy'
);
select results_eq(
  $$select site_name, crew_slot, crew_size, duration_minutes, cleaner_pay_cents
    from public.vacancies
    where job_id = '40000000-0000-4000-8000-000000000001'$$,
  $$values ('Broadbeach Towers'::text, 2, 2, 120, 12000)$$,
  'a vacancy carries the site, schedule units, rate, and exact crew slot'
);
select results_eq(
  $$select preferred_cleaner_ids
    from public.vacancies
    where job_id = '40000000-0000-4000-8000-000000000001'$$,
  $$values (array[
    '10000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid
  ])$$,
  'a vacancy carries the site preferred-cleaner order'
);
select throws_ok(
  $$insert into public.job_assignments (job_id, slot_number, cleaner_id)
    values (
      '40000000-0000-4000-8000-000000000001',
      1,
      '10000000-0000-4000-8000-000000000003'
    )$$,
  '23505',
  null,
  'one crew slot cannot have two active assignments'
);
select throws_ok(
  $$insert into public.job_assignments (job_id, slot_number, cleaner_id)
    values (
      '40000000-0000-4000-8000-000000000001',
      3,
      '10000000-0000-4000-8000-000000000003'
    )$$,
  '23514',
  'Crew slot must be between 1 and job crew size',
  'an assignment slot cannot exceed job crew size'
);
select throws_ok(
  $$insert into public.job_assignments (job_id, slot_number, cleaner_id)
    values (
      '40000000-0000-4000-8000-000000000001',
      2,
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '23505',
  null,
  'one cleaner cannot fill two active slots on the same job'
);
insert into public.job_assignments (job_id, slot_number, cleaner_id)
values (
  '40000000-0000-4000-8000-000000000001',
  2,
  '10000000-0000-4000-8000-000000000003'
);
select lives_ok(
  $$update public.job_assignments
    set unassigned_at = now()
    where job_id = '40000000-0000-4000-8000-000000000001'
      and slot_number = 2;
    update public.jobs
    set crew_size = 1
    where id = '40000000-0000-4000-8000-000000000001'$$,
  'a job can shrink after its higher crew slot is unassigned'
);
select throws_ok(
  $$update public.job_assignments
    set unassigned_at = null
    where job_id = '40000000-0000-4000-8000-000000000001'
      and slot_number = 2$$,
  '23514',
  'Crew slot must be between 1 and job crew size',
  'reactivating a historical assignment rechecks the current crew size'
);
update public.jobs
set crew_size = 2
where id = '40000000-0000-4000-8000-000000000001';

insert into public.jobs (
  id, site_id, service_id, scheduled_start, duration_minutes,
  cleaner_pay_cents, status, crew_size
) values
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000402',
    '30000000-0000-4000-8000-000000000001',
    '2026-08-10T09:00:00+10', 120, 10000, 'posted', 1
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000402',
    '30000000-0000-4000-8000-000000000001',
    '2026-08-10T11:00:00+10', 60, 10000, 'assigned', 1
  );
select throws_ok(
  $$insert into public.job_assignments (job_id, slot_number, cleaner_id)
    values (
      '40000000-0000-4000-8000-000000000002',
      1,
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '23P01',
  null,
  'one cleaner cannot hold two overlapping active jobs'
);
select lives_ok(
  $$insert into public.job_assignments (job_id, slot_number, cleaner_id)
    values (
      '40000000-0000-4000-8000-000000000003',
      1,
      '10000000-0000-4000-8000-000000000002'
    )$$,
  'a cleaner can take a job that starts when the prior job ends'
);
select throws_ok(
  $$insert into public.job_assignments (job_id, slot_number, cleaner_id)
    values (
      '40000000-0000-4000-8000-000000000002',
      1,
      '20000000-0000-4000-8000-000000000002'
    )$$,
  '23514',
  'Cleaner must be an active pool member of the job company',
  'a cleaner from another company cannot be assigned'
);
select throws_ok(
  $$insert into public.job_assignments (job_id, slot_number, cleaner_id)
    values (
      '40000000-0000-4000-8000-000000000002',
      1,
      '10000000-0000-4000-8000-000000000005'
    )$$,
  '23514',
  'Cleaner must be an active pool member of the job company',
  'a removed pool cleaner cannot be assigned'
);
select throws_ok(
  $$insert into public.job_assignments (job_id, slot_number, cleaner_id)
    values (
      '40000000-0000-4000-8000-000000000002',
      1,
      '10000000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  'Cleaner must be an active pool member of the job company',
  'a company-admin profile cannot fill a crew slot'
);

insert into public.jobs (
  id, site_id, service_id, scheduled_start, duration_minutes,
  cleaner_pay_cents, status, crew_size
) values (
  '40000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000401',
  '30000000-0000-4000-8000-000000000002',
  '2026-08-11T08:00:00+10', 60, 9000, 'posted', 1
);
insert into public.job_assignments (job_id, slot_number, cleaner_id)
values (
  '40000000-0000-4000-8000-000000000004',
  1,
  '20000000-0000-4000-8000-000000000002'
);
update public.jobs
set status = 'cancelled'
where id = '40000000-0000-4000-8000-000000000002';

select is(
  (select count(*)::integer from public.vacancies where job_id = '40000000-0000-4000-8000-000000000002'),
  0,
  'cancelled jobs never project vacancies'
);
select is(
  (select count(*)::integer from public.vacancies where job_id = '40000000-0000-4000-8000-000000000003'),
  0,
  'a fully assigned job has no vacancy'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.jobs where id in (
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000004'
  )),
  3,
  'company admin sees only their own jobs'
);
select is(
  (select count(*)::integer from public.job_assignments where job_id in (
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000004'
  )),
  3,
  'company admin sees only their own slot assignments'
);
select is(
  (select count(*)::integer from public.vacancies where job_id in (
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000004'
  )),
  1,
  'company admin sees only their own vacancies'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.jobs where id in (
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000004'
  )),
  1,
  'another company admin cannot read foreign jobs'
);
select is(
  (select count(*)::integer from public.job_assignments where job_id in (
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000004'
  )),
  1,
  'another company admin cannot read foreign assignments'
);
select is(
  (select count(*)::integer from public.vacancies where job_id in (
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000004'
  )),
  0,
  'a fully assigned foreign-company job contributes no visible vacancy'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.jobs), 0, 'cleaner role cannot read raw jobs');
select is(
  (select count(*)::integer from public.job_assignments),
  0,
  'cleaner role cannot read raw assignments'
);
select is(
  (select count(*)::integer from public.vacancies),
  0,
  'cleaner role cannot read the company-admin vacancy projection'
);
reset role;

select * from finish();
rollback;
