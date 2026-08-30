begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Public contract: tables, enums, views, grants, and RPC-only writes.
select is(
  (
    select count(*)::integer
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'job_applications',
        'notifications',
        'site_access_log'
      )
  ),
  3,
  'applications, notification records, and the site access audit exist'
);
select results_eq(
  $$select enumlabel::text collate "C"
    from pg_enum
    where enumtypid = 'public.application_status'::regtype
    order by enumsortorder$$,
  $$values
    ('applied'::text collate "C"),
    ('assigned'::text collate "C"),
    ('not_selected'::text collate "C"),
    ('withdrawn'::text collate "C"),
    ('hired'::text collate "C"),
    ('job_filled'::text collate "C"),
    ('posting_closed'::text collate "C")$$,
  'applications have the complete visible lifecycle'
);
select results_eq(
  $$select enumlabel::text collate "C"
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
    order by enumsortorder$$,
  $$values
    ('job_assigned'::text collate "C"),
    ('job_posted'::text collate "C"),
    ('job_cancelled'::text collate "C"),
    ('application_received'::text collate "C"),
    ('payment_marked_paid'::text collate "C"),
    ('offer_received'::text collate "C"),
    ('offer_declined'::text collate "C"),
    ('job_paid'::text collate "C"),
    ('hired'::text collate "C"),
    ('admitted'::text collate "C"),
    ('rejected'::text collate "C")$$,
  'notification records retain loop, application-review, settlement, and offer events'
);
select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.job_applications'::regclass,
      'public.notifications'::regclass,
      'public.site_access_log'::regclass
    )
      and relrowsecurity
  ),
  3,
  'every new table has RLS enabled'
);
select is(
  (
    select count(*)::integer
    from information_schema.views
    where table_schema = 'public'
      and table_name in ('cleaner_job_board', 'cleaner_my_jobs')
  ),
  2,
  'cleaners receive dedicated board and assigned-job views'
);
select results_eq(
  $$select string_agg(column_name::text, ',' order by ordinal_position) collate "C"
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cleaner_job_board'$$,
  $$values (
    'job_id,company_id,company_name,company_logo_path,site_name,suburb,service_id,service_name,scheduled_start,duration_minutes,cleaner_pay_cents,crew_size,crew_slot,my_application_status,service_slug'::text collate "C"
  )$$,
  'the board view exposes only its reviewed safe projection'
);
select results_eq(
  $$select string_agg(column_name::text, ',' order by ordinal_position) collate "C"
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cleaner_my_jobs'$$,
  $$values (
    'assignment_id,job_id,slot_number,company_id,company_name,company_logo_path,site_name,suburb,service_id,service_name,status,scheduled_start,duration_minutes,cleaner_pay_cents,assigned_at,service_slug'::text collate "C"
  )$$,
  'the assigned-job view exposes only its reviewed safe projection'
);
select is(
  (
    select count(*)::integer
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name in (
        'apply_to_job',
        'withdraw_application',
        'post_job',
        'assign_job_slot',
        'update_job_status',
        'cancel_job',
        'get_cleaner_job_access'
      )
  ),
  7,
  'the loop exposes seven narrow database RPCs'
);
select ok(
  has_table_privilege('authenticated', 'public.job_applications', 'SELECT')
    and has_table_privilege('authenticated', 'public.notifications', 'SELECT'),
  'authenticated users can read applications and their notification records through RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.job_applications',
    'INSERT,UPDATE,DELETE'
  )
    and not has_table_privilege(
      'authenticated',
      'public.notifications',
      'INSERT,DELETE'
    )
    and not has_table_privilege(
      'authenticated',
      'public.site_access_log',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
  'authenticated mutations and the audit log stay behind narrow RPCs'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.job_applications',
    'SELECT,INSERT,UPDATE,DELETE'
  )
    and has_table_privilege(
      'service_role',
      'public.notifications',
      'SELECT,INSERT,UPDATE,DELETE'
    )
    and has_table_privilege(
      'service_role',
      'public.site_access_log',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
  'service role has explicit DML grants on every new table'
);
select ok(
  has_table_privilege('authenticated', 'public.cleaner_job_board', 'SELECT')
    and has_table_privilege('authenticated', 'public.cleaner_my_jobs', 'SELECT')
    and has_table_privilege('service_role', 'public.cleaner_job_board', 'SELECT')
    and has_table_privilege('service_role', 'public.cleaner_my_jobs', 'SELECT'),
  'cleaner views have explicit authenticated and service-role grants'
);
select ok(
  has_function_privilege('authenticated', 'public.apply_to_job(uuid)', 'EXECUTE')
    and has_function_privilege(
      'authenticated',
      'public.withdraw_application(uuid)',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.post_job(uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.assign_job_slot(uuid,integer,uuid)',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.update_job_status(uuid,public.job_status)',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.cancel_job(uuid)',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.get_cleaner_job_access(uuid)',
      'EXECUTE'
    ),
  'authenticated callers execute public loop RPCs but not the internal assignment helper'
);
select ok(
  not has_function_privilege('anon', 'public.apply_to_job(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.withdraw_application(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.post_job(uuid)', 'EXECUTE')
    and not has_function_privilege(
      'anon',
      'public.assign_job_slot(uuid,integer,uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.update_job_status(uuid,public.job_status)',
      'EXECUTE'
    )
    and not has_function_privilege('anon', 'public.cancel_job(uuid)', 'EXECUTE')
    and not has_function_privilege(
      'anon',
      'public.get_cleaner_job_access(uuid)',
      'EXECUTE'
    ),
  'anonymous callers cannot execute loop RPCs'
);

-- The rest of this legacy suite tests the helper's validation and lifecycle mechanics.
-- This transaction-local grant is rolled back and does not change the public capability.
grant execute on function public.assign_job_slot(uuid, integer, uuid) to authenticated;

select hasnt_column(
  'public', 'cleaner_job_board', 'address',
  'the board never exposes a full address'
);
select hasnt_column(
  'public', 'cleaner_job_board', 'access_notes',
  'the board never exposes access notes'
);
select hasnt_column(
  'public', 'cleaner_job_board', 'client_phone',
  'the board never exposes the client phone'
);
select hasnt_column(
  'public', 'cleaner_job_board', 'client_charge_cents',
  'the board never exposes the client charge'
);
select hasnt_column(
  'public', 'cleaner_my_jobs', 'address',
  'the assigned-job list keeps address disclosure behind the logged RPC'
);
select hasnt_column(
  'public', 'cleaner_my_jobs', 'access_notes',
  'the assigned-job list keeps access notes behind the logged RPC'
);
select hasnt_column(
  'public', 'cleaner_my_jobs', 'client_phone',
  'assigned-job reads never expose the client phone'
);
select hasnt_column(
  'public', 'cleaner_my_jobs', 'client_charge_cents',
  'assigned-job reads never expose the client charge'
);
select ok(
  pg_get_function_result('public.get_cleaner_job_access(uuid)'::regprocedure)
    !~* '(phone|charge|client)',
  'the logged private-detail RPC cannot return client identity, phone, or charge'
);

-- Demo seed contract for both app tracks.
select ok(
  exists (
    select 1
    from public.vacancies
    where scheduled_start > now()
  ),
  'seed has a future open job'
);
select ok(
  exists (
    select 1
    from public.job_applications application
    join public.vacancies vacancy on vacancy.job_id = application.job_id
    where application.status = 'applied'
  ),
  'seed has an application on an open job'
);
select ok(
  exists (
    select 1
    from public.job_assignments
    where unassigned_at is null
  ),
  'seed has an active assignment'
);

-- A second tenant and an additional active cleaner exercise multi-pool and direct assignment.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  (
    '49000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle49-foreign-admin@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"CLE-49 Foreign Admin"}', now(), now(), '', '', '', ''
  ),
  (
    '49000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle49-foreign-cleaner@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"CLE-49 Foreign Cleaner"}', now(), now(), '', '', '', ''
  ),
  (
    '49000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle49-direct-cleaner@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"CLE-49 Direct Cleaner"}', now(), now(), '', '', '', ''
  );
insert into public.companies (id, name, abn, status)
values (
  '49000000-0000-4000-8000-000000000010',
  'CLE-49 Foreign Company',
  '49999999999',
  'approved'
);
insert into public.employee_memberships (company_id, profile_id, role)
values (
  '49000000-0000-4000-8000-000000000010',
  '49000000-0000-4000-8000-000000000001',
  'owner'
);
insert into public.company_members (company_id, profile_id)
values
  (
    '49000000-0000-4000-8000-000000000010',
    '49000000-0000-4000-8000-000000000002'
  ),
  (
    '49000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000002'
  ),
  (
    '10000000-0000-4000-8000-000000000010',
    '49000000-0000-4000-8000-000000000003'
  );
insert into public.clients (id, company_id, name, phone)
values (
  '49000000-0000-4000-8000-000000000301',
  '49000000-0000-4000-8000-000000000010',
  'CLE-49 Foreign Client',
  '07 5555 4999'
);
insert into public.sites (id, client_id, name, address, suburb, access_notes)
values
  (
    '49000000-0000-4000-8000-000000000401',
    '49000000-0000-4000-8000-000000000301',
    'CLE-49 Foreign Site',
    '49 Foreign Street',
    'Coolangatta',
    'Foreign access secret'
  ),
  (
    '49000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000301',
    'CLE-49 No-notes Site',
    '49 Quiet Street',
    'Southport',
    null
  );

insert into public.jobs (
  id, site_id, service_id, scheduled_start, duration_minutes,
  cleaner_pay_cents, client_charge_cents, status, crew_size
) values
  (
    '49000000-0000-4000-8000-000000000501',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-08-18T08:00:00+10', 120, 12000, 19000, 'posted', 2
  ),
  (
    '49000000-0000-4000-8000-000000000502',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-08-18T09:00:00+10', 120, 12000, 19000, 'posted', 1
  ),
  (
    '49000000-0000-4000-8000-000000000503',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-08-18T12:00:00+10', 60, 8000, 13000, 'draft', 1
  ),
  (
    '49000000-0000-4000-8000-000000000504',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-08-18T15:00:00+10', 120, 11000, 17000, 'posted', 2
  ),
  (
    '49000000-0000-4000-8000-000000000505',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-08-18T15:30:00+10', 60, 9000, 14000, 'posted', 1
  ),
  (
    '49000000-0000-4000-8000-000000000506',
    '49000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-08-19T08:00:00+10', 90, 10000, 16000, 'posted', 1
  ),
  (
    '49000000-0000-4000-8000-000000000507',
    '49000000-0000-4000-8000-000000000402',
    '30000000-0000-4000-8000-000000000002',
    '2099-08-20T08:00:00+10', 60, 9000, 14000, 'posted', 1
  ),
  (
    '49000000-0000-4000-8000-000000000508',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-08-21T08:00:00+10', 60, 9000, 14000, 'posted', 1
  ),
  (
    '49000000-0000-4000-8000-000000000509',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-08-22T08:00:00+10', 60, 9000, 14000, 'posted', 1
  ),
  (
    '49000000-0000-4000-8000-000000000510',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-08-23T08:00:00+10', 60, 9000, 14000, 'posted', 1
  );

-- Board boundary and cross-pool visibility before any assignment.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select job_id, company_id, site_name, suburb, service_name,
           scheduled_start, duration_minutes, cleaner_pay_cents, crew_slot
    from public.cleaner_job_board
    where job_id in (
      '49000000-0000-4000-8000-000000000501',
      '49000000-0000-4000-8000-000000000506'
    )
    order by job_id, crew_slot$$,
  $$values
    (
      '49000000-0000-4000-8000-000000000501'::uuid,
      '10000000-0000-4000-8000-000000000010'::uuid,
      'Broadbeach Towers'::text,
      'Broadbeach'::text,
      'Standard clean'::text,
      '2099-08-18T08:00:00+10'::timestamptz,
      120,
      12000,
      1
    ),
    (
      '49000000-0000-4000-8000-000000000501'::uuid,
      '10000000-0000-4000-8000-000000000010'::uuid,
      'Broadbeach Towers'::text,
      'Broadbeach'::text,
      'Standard clean'::text,
      '2099-08-18T08:00:00+10'::timestamptz,
      120,
      12000,
      2
    ),
    (
      '49000000-0000-4000-8000-000000000506'::uuid,
      '49000000-0000-4000-8000-000000000010'::uuid,
      'CLE-49 Foreign Site'::text,
      'Coolangatta'::text,
      'Standard clean'::text,
      '2099-08-19T08:00:00+10'::timestamptz,
      90,
      10000,
      1
    )$$,
  'a cleaner sees board-safe vacancy rows across both joined pools'
);
select is((select count(*)::integer from public.jobs), 0, 'cleaner still sees no raw jobs');
select is((select count(*)::integer from public.sites), 0, 'cleaner still sees no raw sites');
select is((select count(*)::integer from public.clients), 0, 'cleaner still sees no raw clients');
select throws_ok(
  $$select * from public.get_cleaner_job_access(
      '49000000-0000-4000-8000-000000000501'
    )$$,
  '42501',
  'Job access is unavailable',
  'an applicant cannot read address or access notes before assignment'
);
select lives_ok(
  $$select public.apply_to_job('49000000-0000-4000-8000-000000000501')$$,
  'an active pool cleaner can apply while a crew slot is open'
);
select results_eq(
  $$select cleaner_id, status::text
    from public.job_applications
    where job_id = '49000000-0000-4000-8000-000000000501'$$,
  $$values (
    '10000000-0000-4000-8000-000000000002'::uuid,
    'applied'::text
  )$$,
  'application identity comes from auth and persists in the applied state'
);
select throws_ok(
  $$select public.apply_to_job('49000000-0000-4000-8000-000000000501')$$,
  '23505',
  'Cleaner can apply only once per job',
  'a cleaner cannot apply twice to one job'
);
select lives_ok(
  $$select public.withdraw_application('49000000-0000-4000-8000-000000000501')$$,
  'the applicant can withdraw'
);
select ok(
  (
    select status = 'withdrawn' and withdrawn_at is not null
    from public.job_applications
    where job_id = '49000000-0000-4000-8000-000000000501'
      and cleaner_id = '10000000-0000-4000-8000-000000000002'
  ),
  'withdrawal resolves but preserves application history'
);
select throws_ok(
  $$select public.apply_to_job('49000000-0000-4000-8000-000000000501')$$,
  '23505',
  'Cleaner can apply only once per job',
  'withdrawal does not allow queue re-entry'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_job('49000000-0000-4000-8000-000000000501')$$,
  'a second pool cleaner can apply'
);
select throws_ok(
  $$select public.apply_to_job('49000000-0000-4000-8000-000000000506')$$,
  '42501',
  'Job is not available',
  'a cleaner cannot apply outside a joined pool'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_job('49000000-0000-4000-8000-000000000501')$$,
  'a third pool cleaner can apply'
);
select throws_ok(
  $$select public.apply_to_job('49000000-0000-4000-8000-000000000503')$$,
  '23514',
  'Job has no open slots',
  'draft jobs do not accept applications'
);
select throws_ok(
  $$select public.withdraw_application('49000000-0000-4000-8000-000000000506')$$,
  '42501',
  'Active application not found',
  'a cleaner cannot withdraw another or nonexistent application'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.apply_to_job('49000000-0000-4000-8000-000000000501')$$,
  '42501',
  'Job is not available',
  'a removed pool cleaner cannot apply'
);
select is(
  (select count(*)::integer from public.cleaner_job_board),
  0,
  'a removed pool cleaner sees no board vacancies'
);
reset role;

-- Per-slot assignment: partial fill remains posted, final fill resolves applications.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000502',
      0,
      '10000000-0000-4000-8000-000000000004'
    )$$,
  '23514',
  'Crew slot is outside the job crew size',
  'an admin cannot assign a slot outside the job crew size'
);
select throws_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000502',
      1,
      '49000000-0000-4000-8000-000000000002'
    )$$,
  '23514',
  'Cleaner is not an active pool member',
  'an admin cannot assign a cleaner from another company pool'
);
select throws_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000502',
      1,
      '10000000-0000-4000-8000-000000000005'
    )$$,
  '23514',
  'Cleaner is not an active pool member',
  'an admin cannot assign a removed pool cleaner'
);
select results_eq(
  $$select
      (select count(*)::integer
       from public.job_assignments
       where job_id = '49000000-0000-4000-8000-000000000502'),
      (select count(*)::integer
       from public.notifications
       where job_id = '49000000-0000-4000-8000-000000000502')$$,
  $$values (0, 0)$$,
  'rejected direct assignments create no assignment or notification side effects'
);
select lives_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000501',
      1,
      '10000000-0000-4000-8000-000000000003'
    )$$,
  'company admin assigns an applicant into the first crew slot'
);
select results_eq(
  $$select job.status::text, application.status::text,
           (select count(*)::integer
            from public.vacancies vacancy
            where vacancy.job_id = job.id)
    from public.jobs job
    join public.job_applications application
      on application.job_id = job.id
     and application.cleaner_id = '10000000-0000-4000-8000-000000000003'
    where job.id = '49000000-0000-4000-8000-000000000501'$$,
  $$values ('posted'::text, 'assigned'::text, 1)$$,
  'one selected slot resolves its applicant while the crew-two job stays open'
);
select is(
  (
    select status::text
    from public.job_applications
    where job_id = '49000000-0000-4000-8000-000000000501'
      and cleaner_id = '10000000-0000-4000-8000-000000000004'
  ),
  'applied',
  'unselected applicants keep waiting while a slot remains'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select job_id, slot_number, status::text
    from public.cleaner_my_jobs
    where job_id = '49000000-0000-4000-8000-000000000501'$$,
  $$values (
    '49000000-0000-4000-8000-000000000501'::uuid,
    1,
    'posted'::text
  )$$,
  'a cleaner owns her assigned slot even while the crew-two job remains posted'
);
select results_eq(
  $$select address, access_notes
    from public.get_cleaner_job_access(
      '49000000-0000-4000-8000-000000000501'
    )$$,
  $$values (
    '10 Surf Parade'::text,
    'Demo access notes — company admin only'::text
  )$$,
  'a partial-crew assignee can open the assignment-gated site details'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.site_access_log
    where job_id = '49000000-0000-4000-8000-000000000501'
      and cleaner_id = '10000000-0000-4000-8000-000000000003'
  ),
  1,
  'partial-crew sensitive disclosure is logged'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000501',
      2,
      '49000000-0000-4000-8000-000000000003'
    )$$,
  'company admin directly assigns an active pool cleaner with no application'
);
select results_eq(
  $$select status::text,
           (select count(*)::integer
            from public.job_assignments assignment
            where assignment.job_id = job.id
              and assignment.unassigned_at is null),
           (select count(*)::integer
            from public.vacancies vacancy
            where vacancy.job_id = job.id)
    from public.jobs job
    where id = '49000000-0000-4000-8000-000000000501'$$,
  $$values ('assigned'::text, 2, 0)$$,
  'two different cleaners completely fill the crew-two job'
);
select results_eq(
  $$select cleaner_id, status::text
    from public.job_applications
    where job_id = '49000000-0000-4000-8000-000000000501'
    order by cleaner_id$$,
  $$values
    ('10000000-0000-4000-8000-000000000002'::uuid, 'withdrawn'::text),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'assigned'::text),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'not_selected'::text)$$,
  'final-slot fill resolves every real application without fabricating a direct one'
);
select is(
  (
    select count(*)::integer
    from public.job_applications
    where job_id = '49000000-0000-4000-8000-000000000501'
      and cleaner_id = '49000000-0000-4000-8000-000000000003'
  ),
  0,
  'direct assignment does not fabricate an application'
);
reset role;
select results_eq(
  $$select type::text, recipient_id
    from public.notifications
    where job_id = '49000000-0000-4000-8000-000000000501'
      and type = 'job_assigned'
    order by recipient_id$$,
  $$values
    ('job_assigned'::text, '10000000-0000-4000-8000-000000000003'::uuid),
    ('job_assigned'::text, '49000000-0000-4000-8000-000000000003'::uuid)$$,
  'each manual slot assignment creates exactly one assignment notification'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000502',
      1,
      '10000000-0000-4000-8000-000000000003'
    )$$,
  '23514',
  'Cleaner is unavailable for this time',
  'a cleaner cannot hold two overlapping jobs without leaking the conflicting window'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.job_assignments
    where job_id = '49000000-0000-4000-8000-000000000502'
  ),
  0,
  'overlap rejection rolls the assignment back'
);
select is(
  (
    select count(*)::integer
    from public.notifications
    where job_id = '49000000-0000-4000-8000-000000000502'
  ),
  0,
  'overlap rejection also rolls notification side effects back'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000502',
      1,
      '10000000-0000-4000-8000-000000000004'
    )$$,
  '42501',
  'Company admin access required',
  'a foreign company admin cannot assign a slot'
);
select throws_ok(
  $$select public.cancel_job('49000000-0000-4000-8000-000000000501')$$,
  '42501',
  'Company admin access required',
  'a foreign company admin cannot cancel the job'
);
select throws_ok(
  $$select public.post_job('49000000-0000-4000-8000-000000000503')$$,
  '42501',
  'Company admin access required',
  'a foreign company admin cannot publish another company job'
);
reset role;
select results_eq(
  $$select
      (select status::text
       from public.jobs
       where id = '49000000-0000-4000-8000-000000000503'),
      (select count(*)::integer
       from public.notifications
       where job_id = '49000000-0000-4000-8000-000000000503')$$,
  $$values ('draft'::text, 0)$$,
  'rejected foreign publishing leaves the draft and notification state unchanged'
);

-- Assigned-job list and the access-logged private disclosure.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select job_id, slot_number, site_name, suburb, status::text
    from public.cleaner_my_jobs
    where job_id = '49000000-0000-4000-8000-000000000501'$$,
  $$values (
    '49000000-0000-4000-8000-000000000501'::uuid,
    1,
    'Broadbeach Towers'::text,
    'Broadbeach'::text,
    'assigned'::text
  )$$,
  'an assigned cleaner sees only her own safe job summary'
);
select is(
  (
    select count(*)::integer
    from public.cleaner_job_board
    where job_id = '49000000-0000-4000-8000-000000000501'
  ),
  0,
  'an assigned cleaner is not offered another slot on the same job'
);
select results_eq(
  $$select address, access_notes
    from public.get_cleaner_job_access(
      '49000000-0000-4000-8000-000000000501'
    )$$,
  $$values (
    '10 Surf Parade'::text,
    'Demo access notes — company admin only'::text
  )$$,
  'an assigned cleaner can open the address and access notes'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.site_access_log
    where job_id = '49000000-0000-4000-8000-000000000501'
      and cleaner_id = '10000000-0000-4000-8000-000000000003'
  ),
  2,
  'each successful sensitive disclosure writes its own access record'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.cleaner_my_jobs
    where job_id = '49000000-0000-4000-8000-000000000501'
  ),
  0,
  'another cleaner in the pool cannot see the assigned job'
);
select throws_ok(
  $$select * from public.get_cleaner_job_access(
      '49000000-0000-4000-8000-000000000501'
    )$$,
  '42501',
  'Job access is unavailable',
  'another cleaner cannot open its private site details'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.site_access_log
    where job_id = '49000000-0000-4000-8000-000000000501'
      and cleaner_id = '10000000-0000-4000-8000-000000000004'
  ),
  0,
  'denied sensitive access writes no audit record'
);

-- Either assigned cleaner may advance the shared job, but only one exact step at a time.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.update_job_status(
      '49000000-0000-4000-8000-000000000501',
      'on_the_way'
    )$$,
  '42501',
  'Assigned cleaner access required',
  'an unassigned cleaner cannot drive job status'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.update_job_status(
      '49000000-0000-4000-8000-000000000501',
      'in_progress'
    )$$,
  '23514',
  'Invalid job status transition',
  'status cannot skip on-the-way'
);
select lives_ok(
  $$select public.update_job_status(
      '49000000-0000-4000-8000-000000000501',
      'on_the_way'
    )$$,
  'the first assigned cleaner moves the job on the way'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.update_job_status(
      '49000000-0000-4000-8000-000000000501',
      'in_progress'
    )$$,
  'the second assigned cleaner moves the shared job in progress'
);
select throws_ok(
  $$select public.update_job_status(
      '49000000-0000-4000-8000-000000000501',
      'on_the_way'
    )$$,
  '23514',
  'Invalid job status transition',
  'status cannot move backwards'
);
select lives_ok(
  $$select public.update_job_status(
      '49000000-0000-4000-8000-000000000501',
      'completed'
    )$$,
  'an assigned cleaner completes the job'
);
reset role;
select is(
  (
    select status::text
    from public.jobs
    where id = '49000000-0000-4000-8000-000000000501'
  ),
  'completed',
  'the shared job persists its completed state'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.cleaner_my_jobs
    where job_id = '49000000-0000-4000-8000-000000000501'
  ),
  0,
  'completed jobs leave the cleaner active-job list'
);
select throws_ok(
  $$select * from public.get_cleaner_job_access(
      '49000000-0000-4000-8000-000000000501'
    )$$,
  '42501',
  'Job access is unavailable',
  'the private detail window closes on completion'
);
reset role;

-- Manual posting, crew cancellation, and released overlap.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.post_job('49000000-0000-4000-8000-000000000503')$$,
  'company admin manually posts a draft job'
);
select is(
  (
    select status::text
    from public.jobs
    where id = '49000000-0000-4000-8000-000000000503'
  ),
  'posted',
  'manual post persists the posted state'
);
reset role;
select results_eq(
  $$select type::text, recipient_id
    from public.notifications
    where job_id = '49000000-0000-4000-8000-000000000503'
    order by recipient_id$$,
  $$values
    ('job_posted'::text, '10000000-0000-4000-8000-000000000002'::uuid),
    ('job_posted'::text, '10000000-0000-4000-8000-000000000003'::uuid),
    ('job_posted'::text, '10000000-0000-4000-8000-000000000004'::uuid),
    ('job_posted'::text, '49000000-0000-4000-8000-000000000003'::uuid)$$,
  'manual post records one notification per active cleaner pool member'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.notifications
    where job_id = '49000000-0000-4000-8000-000000000503'
  ),
  1,
  'a cleaner reads her own manual-post notification'
);
select is(
  (
    select count(*)::integer
    from public.notifications
    where job_id = '49000000-0000-4000-8000-000000000503'
      and recipient_id <> '10000000-0000-4000-8000-000000000002'
  ),
  0,
  'notification RLS hides every other recipient record'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.post_job('49000000-0000-4000-8000-000000000503')$$,
  '23514',
  'Only draft jobs can be posted',
  'a job cannot be manually posted twice'
);
select lives_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000504',
      1,
      '10000000-0000-4000-8000-000000000003'
    )$$,
  'first cleaner fills the cancellation fixture'
);
select lives_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000504',
      2,
      '10000000-0000-4000-8000-000000000004'
    )$$,
  'second cleaner fills the cancellation fixture'
);
select lives_ok(
  $$select public.cancel_job('49000000-0000-4000-8000-000000000504')$$,
  'company admin cancels an assigned crew-two job'
);
select results_eq(
  $$select status::text,
           (select count(*)::integer
            from public.job_assignments assignment
            where assignment.job_id = job.id
              and assignment.unassigned_at is null),
           (select count(*)::integer
            from public.vacancies vacancy
            where vacancy.job_id = job.id)
    from public.jobs job
    where id = '49000000-0000-4000-8000-000000000504'$$,
  $$values ('cancelled'::text, 0, 0)$$,
  'cancellation closes the job and releases every active crew slot'
);
reset role;
select results_eq(
  $$select type::text, recipient_id
    from public.notifications
    where job_id = '49000000-0000-4000-8000-000000000504'
      and type = 'job_cancelled'
    order by recipient_id$$,
  $$values
    ('job_cancelled'::text, '10000000-0000-4000-8000-000000000003'::uuid),
    ('job_cancelled'::text, '10000000-0000-4000-8000-000000000004'::uuid)$$,
  'cancellation records one notification for each released cleaner'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select * from public.get_cleaner_job_access(
      '49000000-0000-4000-8000-000000000504'
    )$$,
  '42501',
  'Job access is unavailable',
  'cancellation closes the private-detail window'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.site_access_log
    where job_id = '49000000-0000-4000-8000-000000000504'
  ),
  0,
  'denied post-cancellation access creates no audit record'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000505',
      1,
      '10000000-0000-4000-8000-000000000003'
    )$$,
  'released cancellation slots no longer block an overlapping assignment'
);
select lives_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000507',
      1,
      '10000000-0000-4000-8000-000000000003'
    )$$,
  'an active pool cleaner can be assigned to a site with no access notes'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select address, access_notes
    from public.get_cleaner_job_access(
      '49000000-0000-4000-8000-000000000507'
    )$$,
  $$values ('49 Quiet Street'::text, ''::text)$$,
  'the logged detail contract returns an empty access-notes string instead of runtime null'
);
reset role;

-- Pool and role removal release pre-work manual assignments without erasing history.
insert into public.company_members (company_id, profile_id)
values (
  '10000000-0000-4000-8000-000000000010',
  '49000000-0000-4000-8000-000000000002'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_job('49000000-0000-4000-8000-000000000508')$$,
  'the lifecycle cleaner applies before pool removal'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000508',
      1,
      '49000000-0000-4000-8000-000000000002'
    )$$,
  'the lifecycle cleaner is assigned before pool removal'
);
reset role;
update public.company_members
set status = 'removed'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '49000000-0000-4000-8000-000000000002';
select results_eq(
  $$select
      (select status::text
       from public.jobs
       where id = '49000000-0000-4000-8000-000000000508'),
      (select count(*)::integer
       from public.job_assignments
       where job_id = '49000000-0000-4000-8000-000000000508'
         and unassigned_at is null),
      (select status::text
       from public.job_applications
       where job_id = '49000000-0000-4000-8000-000000000508'
         and cleaner_id = '49000000-0000-4000-8000-000000000002'),
      (select count(*)::integer
       from public.vacancies
       where job_id = '49000000-0000-4000-8000-000000000508')$$,
  $$values ('posted'::text, 0, 'not_selected'::text, 1)$$,
  'pool removal reopens the slot and resolves the removed cleaner application'
);
select ok(
  (
    select unassigned_at >= assigned_at
    from public.job_assignments
    where job_id = '49000000-0000-4000-8000-000000000508'
      and cleaner_id = '49000000-0000-4000-8000-000000000002'
  ),
  'pool-removal history has a valid assignment chronology'
);

update public.company_members
set status = 'active'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '49000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000508',
      1,
      '49000000-0000-4000-8000-000000000002'
    )$$,
  'a reactivated pool member can be selected for the reopened slot'
);
select is(
  (
    select status::text
    from public.job_applications
    where job_id = '49000000-0000-4000-8000-000000000508'
      and cleaner_id = '49000000-0000-4000-8000-000000000002'
  ),
  'assigned',
  'reassigning a previously not-selected applicant restores the assigned state'
);
select lives_ok(
  $$select public.cancel_job('49000000-0000-4000-8000-000000000508')$$,
  'the reopened lifecycle fixture can be closed explicitly'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_job('49000000-0000-4000-8000-000000000509')$$,
  'the lifecycle cleaner applies before role removal'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000509',
      1,
      '49000000-0000-4000-8000-000000000002'
    )$$,
  'the lifecycle cleaner is assigned before role removal'
);
reset role;
update public.company_members
set status = 'removed'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '49000000-0000-4000-8000-000000000002';
select results_eq(
  $$select
      (select status::text
       from public.jobs
       where id = '49000000-0000-4000-8000-000000000509'),
      (select count(*)::integer
       from public.job_assignments
       where job_id = '49000000-0000-4000-8000-000000000509'
         and unassigned_at is null),
      (select status::text
       from public.job_applications
       where job_id = '49000000-0000-4000-8000-000000000509'
         and cleaner_id = '49000000-0000-4000-8000-000000000002')$$,
  $$values ('posted'::text, 0, 'not_selected'::text)$$,
  'pool removal reopens the slot and resolves the former cleaner application'
);
update public.company_members
set status = 'active'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '49000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_job('49000000-0000-4000-8000-000000000510')$$,
  'the lifecycle cleaner applies to the in-flight removal fixture'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.assign_job_slot(
      '49000000-0000-4000-8000-000000000510',
      1,
      '49000000-0000-4000-8000-000000000002'
    )$$,
  'the lifecycle cleaner is assigned to the in-flight removal fixture'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.update_job_status(
      '49000000-0000-4000-8000-000000000510',
      'on_the_way'
    )$$,
  'the lifecycle cleaner starts the in-flight removal fixture'
);
reset role;
select lives_ok(
  $$update public.company_members
    set status = 'removed'
    where company_id = '10000000-0000-4000-8000-000000000010'
      and profile_id = '49000000-0000-4000-8000-000000000002'$$,
  'pool removal can proceed without silently stranding an in-flight job'
);
select results_eq(
  $$select membership.status::text, job.status::text,
           count(assignment.id)::integer
    from public.company_members membership
    join public.jobs job on job.id = '49000000-0000-4000-8000-000000000510'
    join public.job_assignments assignment on assignment.job_id = job.id
    where membership.company_id = '10000000-0000-4000-8000-000000000010'
      and membership.profile_id = '49000000-0000-4000-8000-000000000002'
      and assignment.cleaner_id = membership.profile_id
      and assignment.unassigned_at is null
    group by membership.status, job.status$$,
  $$values ('removed'::text, 'on_the_way'::text, 1)$$,
  'pool removal preserves the already-started assignment while revoking future eligibility'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '49000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.cleaner_my_jobs
    where job_id = '49000000-0000-4000-8000-000000000510'
  ),
  1,
  'the removed pool member retains only the already-started assignment'
);
select results_eq(
  $$select address, access_notes
    from public.get_cleaner_job_access(
      '49000000-0000-4000-8000-000000000510'
    )$$,
  $$values (
    '10 Surf Parade'::text,
    'Demo access notes — company admin only'::text
  )$$,
  'the assignment-gated site detail stays available while that job is underway'
);
select lives_ok(
  $$select public.update_job_status(
      '49000000-0000-4000-8000-000000000510',
      'in_progress'
    )$$,
  'the grandfathered assignee can continue the shared job state'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.cancel_job('49000000-0000-4000-8000-000000000510')$$,
  'the admin can explicitly cancel and release the in-flight fixture'
);
reset role;

-- Recurring generation writes neither posted nor assignment notifications.
update public.company_members
set status = 'active'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '49000000-0000-4000-8000-000000000002';
insert into public.recurring_assignments (
  id, site_id, service_id, frequency, weekday, anchor_date, local_start_time,
  duration_minutes, cleaner_pay_cents, crew_size, active
) values
  (
    '49000000-0000-4000-8000-000000000701',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', extract(isodow from date '2099-08-20')::smallint,
    '2099-08-20', '20:00', 60, 9000, 1, true
  ),
  (
    '49000000-0000-4000-8000-000000000702',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', extract(isodow from date '2099-08-21')::smallint,
    '2099-08-21', '22:00', 60, 9000, 1, true
  ),
  (
    '49000000-0000-4000-8000-000000000703',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', extract(isodow from date '2099-08-22')::smallint,
    '2099-08-22', '18:00', 60, 9000, 2, true
  );
insert into public.recurring_assignment_cleaners (
  recurring_assignment_id, slot_number, cleaner_id, accepted_at
) values
  (
    '49000000-0000-4000-8000-000000000702',
    1,
    '49000000-0000-4000-8000-000000000003',
    clock_timestamp()
  ),
  (
    '49000000-0000-4000-8000-000000000703',
    1,
    '49000000-0000-4000-8000-000000000002',
    clock_timestamp()
  );
select lives_ok(
  $$select public.generate_recurring_jobs_at(
      '2099-08-19T00:00:00+10',
      '49000000-0000-4000-8000-000000000701'
    );
    select public.generate_recurring_jobs_at(
      '2099-08-19T00:00:00+10',
      '49000000-0000-4000-8000-000000000702'
    );
    select public.generate_recurring_jobs_at(
      '2099-08-19T00:00:00+10',
      '49000000-0000-4000-8000-000000000703'
    )$$,
  'both open and auto-assigned recurring instances generate'
);
select ok(
  exists (
    select 1
    from public.jobs
    where recurring_assignment_id = '49000000-0000-4000-8000-000000000701'
      and status = 'posted'
  )
    and exists (
      select 1
      from public.jobs
      where recurring_assignment_id = '49000000-0000-4000-8000-000000000702'
        and status = 'assigned'
    ),
  'generation exercised both open and auto-assigned paths'
);

select set_config('test.cle49_generated_crew_job', job.id::text, true)
from public.jobs job
where job.recurring_assignment_id = '49000000-0000-4000-8000-000000000703'
  and job.service_date = '2099-08-22';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_job(
      current_setting('test.cle49_generated_crew_job')::uuid
    )$$,
  'an applicant can touch a partially assigned generated crew job'
);
reset role;
update public.company_members
set status = 'removed'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '49000000-0000-4000-8000-000000000002';
select results_eq(
  $$select job.status::text,
           (select count(*)::integer
            from public.job_assignments assignment
            where assignment.job_id = job.id
              and assignment.unassigned_at is null),
           (select count(*)::integer
            from public.vacancies vacancy
            where vacancy.job_id = job.id),
           (select application.status::text
            from public.job_applications application
            where application.job_id = job.id
              and application.cleaner_id = '10000000-0000-4000-8000-000000000004')
    from public.jobs job
    where job.recurring_assignment_id = '49000000-0000-4000-8000-000000000703'
      and job.service_date = '2099-08-22'$$,
  $$values ('posted'::text, 0, 2, 'applied'::text)$$,
  'pool removal releases a recurring slot even when an application protects the generated job'
);

create temporary table cle49_touched_generated_job as
select
  job.id,
  job.recurring_assignment_id,
  to_jsonb(job) as snapshot,
  (
    select count(*)::integer
    from public.job_applications counted_application
    where counted_application.job_id = job.id
      and counted_application.status = 'applied'
  ) as application_count
from public.jobs job
join public.job_applications application on application.job_id = job.id
where job.id = current_setting('test.cle49_generated_crew_job')::uuid
  and job.recurring_assignment_id is not null
  and job.status = 'posted'
  and job.manually_edited_at is not null
  and application.status = 'applied';
select is(
  (select count(*)::integer from cle49_touched_generated_job),
  1,
  'seed application activity records one generated instance as manually touched'
);
update public.recurring_assignments
set
  duration_minutes = duration_minutes + 30,
  generation_version = generation_version + 1
where id = (select recurring_assignment_id from cle49_touched_generated_job);
select lives_ok(
  $$select public.generate_recurring_jobs_at(
      clock_timestamp(),
      (select recurring_assignment_id from cle49_touched_generated_job)
    )$$,
  'rule reconciliation runs after an application touches one generated instance'
);
select ok(
  (
    select to_jsonb(job) = touched.snapshot
    from cle49_touched_generated_job touched
    join public.jobs job on job.id = touched.id
  ),
  'an application protects its generated instance from silent schedule or pay rewrites'
);
update public.jobs
set status = 'cancelled'
where id = (select id from cle49_touched_generated_job);
select results_eq(
  $$select
      count(*)::integer,
      count(*) filter (where application.status = 'not_selected')::integer,
      count(*) filter (where application.resolved_at is not null)::integer,
      (select count(*)::integer
       from public.notifications notification
       where notification.job_id = (select id from cle49_touched_generated_job)
         and notification.type = 'application_received')
    from public.job_applications application
    where application.job_id = (select id from cle49_touched_generated_job)$$,
  $$select
      application_count,
      application_count,
      application_count,
      (select count(*)::integer
       from public.employee_memberships membership
       where membership.company_id = '10000000-0000-4000-8000-000000000010'
         and membership.status = 'active')
    from cle49_touched_generated_job$$,
  'any job cancellation resolves a waiting application without removing its CRM notification'
);
select is(
  (
    select count(*)::integer
    from public.notifications notification
    join public.jobs job on job.id = notification.job_id
    where job.recurring_assignment_id in (
      '49000000-0000-4000-8000-000000000701',
      '49000000-0000-4000-8000-000000000702',
      '49000000-0000-4000-8000-000000000703'
    )
      and notification.type <> 'application_received'
  ),
  0,
  'generated postings and recurring assignments create no automatic notification records'
);

select * from finish();
rollback;
