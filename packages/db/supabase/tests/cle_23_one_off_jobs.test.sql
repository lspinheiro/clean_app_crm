begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Public contract: one atomic admin RPC and admin-only internal notes.
select has_column(
  'public',
  'jobs',
  'notes',
  'jobs can retain admin-only internal notes'
);
select ok(
  to_regprocedure(
    'public.create_one_off_job(uuid,uuid,date,time without time zone,integer,integer,integer,boolean,integer,text)'
  ) is not null,
  'one-off jobs are created through one narrow atomic RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_one_off_job(uuid,uuid,date,time without time zone,integer,integer,integer,boolean,integer,text)',
    'EXECUTE'
  )
    and has_function_privilege(
      'service_role',
      'public.create_one_off_job(uuid,uuid,date,time without time zone,integer,integer,integer,boolean,integer,text)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.create_one_off_job(uuid,uuid,date,time without time zone,integer,integer,integer,boolean,integer,text)',
      'EXECUTE'
    ),
  'only authenticated and service-role callers can execute the creation RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.jobs', 'INSERT,UPDATE,DELETE'),
  'authenticated callers still cannot mutate jobs directly'
);
select hasnt_column(
  'public',
  'cleaner_job_board',
  'notes',
  'internal notes never enter the cleaner board projection'
);
select hasnt_column(
  'public',
  'cleaner_my_jobs',
  'notes',
  'internal notes never enter the cleaner assigned-job projection'
);

-- A second tenant lets the signed-in demo admin prove tenant isolation.
insert into public.companies (id, name, abn, status)
values (
  '23000000-0000-4000-8000-000000000010',
  'CLE-23 Foreign Company',
  '23999999999',
  'approved'
);
insert into public.clients (id, company_id, name)
values (
  '23000000-0000-4000-8000-000000000301',
  '23000000-0000-4000-8000-000000000010',
  'CLE-23 Foreign Client'
);
insert into public.sites (id, client_id, name, address, suburb)
values (
  '23000000-0000-4000-8000-000000000401',
  '23000000-0000-4000-8000-000000000301',
  'CLE-23 Foreign Site',
  '23 Foreign Street',
  'Coolangatta'
);
insert into public.service_catalogue (id, slug, name, sort_order, active)
values (
  '23000000-0000-4000-8000-000000000601',
  'cle-23-inactive',
  'CLE-23 Inactive Service',
  230,
  false
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config(
  'test.cle23_draft_job',
  public.create_one_off_job(
    target_site_id => '10000000-0000-4000-8000-000000000401',
    target_service_id => '30000000-0000-4000-8000-000000000002',
    target_local_date => '2099-09-01',
    target_local_start_time => '08:30',
    target_duration_minutes => 120,
    target_cleaner_pay_cents => 15000,
    target_crew_size => 2,
    target_post_now => false,
    target_client_charge_cents => null,
    target_notes => '  Internal handover  '
  )::text,
  true
);
select results_eq(
  $$select
      status::text collate "C",
      scheduled_start,
      scheduled_end,
      duration_minutes,
      cleaner_pay_cents,
      crew_size,
      client_charge_cents,
      notes collate "C",
      recurring_assignment_id
    from public.jobs
    where id = current_setting('test.cle23_draft_job')::uuid$$,
  $$values (
    'draft'::text collate "C",
    '2099-09-01T08:30:00+10'::timestamptz,
    '2099-09-01T10:30:00+10'::timestamptz,
    120,
    15000,
    2,
    null::integer,
    'Internal handover'::text collate "C",
    null::uuid
  )$$,
  'saving a draft persists the edited one-off schedule, pay, crew, and notes'
);
select is(
  (
    select count(*)::integer
    from public.vacancies
    where job_id = current_setting('test.cle23_draft_job')::uuid
  ),
  0,
  'a draft crew-two job creates no vacancy'
);
select is(
  (
    select count(*)::integer
    from public.notifications
    where job_id = current_setting('test.cle23_draft_job')::uuid
  ),
  0,
  'saving a draft creates no pool notification'
);

select set_config(
  'test.cle23_posted_job',
  public.create_one_off_job(
    target_site_id => '10000000-0000-4000-8000-000000000401',
    target_service_id => '30000000-0000-4000-8000-000000000003',
    target_local_date => '2099-09-02',
    target_local_start_time => '09:15',
    target_duration_minutes => 180,
    target_cleaner_pay_cents => 17500,
    target_crew_size => 2,
    target_post_now => true,
    target_client_charge_cents => 50000,
    target_notes => 'Post-construction detail clean'
  )::text,
  true
);
select is(
  (
    select status::text
    from public.jobs
    where id = current_setting('test.cle23_posted_job')::uuid
  ),
  'posted',
  'posting through the creation RPC leaves one posted job'
);
select is(
  (
    select count(*)::integer
    from public.vacancies
    where job_id = current_setting('test.cle23_posted_job')::uuid
  ),
  2,
  'a posted crew-two job exposes exactly two vacancies'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.notifications
    where job_id = current_setting('test.cle23_posted_job')::uuid
      and type = 'job_posted'
  ),
  3,
  'an immediate manual post notifies every eligible active pool cleaner once'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.create_one_off_job(
    target_site_id => '23000000-0000-4000-8000-000000000401',
    target_service_id => '30000000-0000-4000-8000-000000000002',
    target_local_date => '2099-09-03',
    target_local_start_time => '10:00',
    target_duration_minutes => 60,
    target_cleaner_pay_cents => 9000,
    target_crew_size => 1,
    target_post_now => false
  )$$,
  '42501',
  'Company admin access required',
  'a company admin cannot create a job for another tenant site'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where site_id = '23000000-0000-4000-8000-000000000401'
  ),
  0,
  'a rejected foreign-site call writes no partial job'
);
select throws_ok(
  $$select public.create_one_off_job(
    target_site_id => '10000000-0000-4000-8000-000000000401',
    target_service_id => '23000000-0000-4000-8000-000000000601',
    target_local_date => '2099-09-03',
    target_local_start_time => '10:00',
    target_duration_minutes => 60,
    target_cleaner_pay_cents => 9000,
    target_crew_size => 1,
    target_post_now => false
  )$$,
  '23514',
  'Service must be active',
  'an inactive service cannot be scheduled'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);
select throws_ok(
  $$select public.create_one_off_job(
    target_site_id => '10000000-0000-4000-8000-000000000401',
    target_service_id => '30000000-0000-4000-8000-000000000002',
    target_local_date => '2099-09-03',
    target_local_start_time => '10:00',
    target_duration_minutes => 60,
    target_cleaner_pay_cents => 9000,
    target_crew_size => 1,
    target_post_now => false
  )$$,
  '42501',
  'Company admin access required',
  'a cleaner cannot create a job'
);
select is(
  (
    select count(*)::integer
    from public.cleaner_job_board
    where job_id = current_setting('test.cle23_posted_job')::uuid
  ),
  2,
  'each posted crew slot reaches an eligible cleaner through the safe board view'
);

reset role;
select * from finish();
rollback;
