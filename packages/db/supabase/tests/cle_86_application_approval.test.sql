begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select results_eq(
  $$select enumlabel::text collate "C"
      from pg_enum
     where enumtypid = 'public.notification_type'::regtype
       and enumlabel = 'application_received'$$,
  $$values ('application_received'::text collate "C")$$,
  'ordinary board applications have a durable CRM notification type'
);

select has_function(
  'public',
  'approve_job_application',
  array['uuid', 'integer', 'uuid'],
  'application approval is a narrow atomic RPC'
);
select has_function(
  'public',
  'mark_job_application_not_selected',
  array['uuid', 'uuid'],
  'not-selected review is a narrow RPC with no free-text reason'
);
select has_function(
  'public',
  'restore_job_application',
  array['uuid', 'uuid'],
  'application restore is a narrow RPC'
);

select function_privs_are(
  'public',
  'approve_job_application',
  array['uuid', 'integer', 'uuid'],
  'authenticated',
  array['EXECUTE'],
  'authenticated employees receive only the approval capability'
);
select function_privs_are(
  'public',
  'mark_job_application_not_selected',
  array['uuid', 'uuid'],
  'authenticated',
  array['EXECUTE'],
  'authenticated employees receive only the not-selected capability'
);
select function_privs_are(
  'public',
  'restore_job_application',
  array['uuid', 'uuid'],
  'authenticated',
  array['EXECUTE'],
  'authenticated employees receive only the restore capability'
);
select function_privs_are(
  'public',
  'approve_job_application',
  array['uuid', 'integer', 'uuid'],
  'anon',
  array[]::text[],
  'anonymous callers cannot approve applications'
);
select function_privs_are(
  'public',
  'mark_job_application_not_selected',
  array['uuid', 'uuid'],
  'anon',
  array[]::text[],
  'anonymous callers cannot resolve applications'
);
select function_privs_are(
  'public',
  'restore_job_application',
  array['uuid', 'uuid'],
  'anon',
  array[]::text[],
  'anonymous callers cannot restore applications'
);
select function_privs_are(
  'public',
  'assign_job_slot',
  array['uuid', 'integer', 'uuid'],
  'authenticated',
  array[]::text[],
  'authenticated callers cannot bypass application approval with direct assignment'
);

select results_eq(
  $$select tablename::text collate "C"
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename in ('job_applications', 'notifications')
     order by tablename$$,
  $$values
    ('job_applications'::text collate "C"),
    ('notifications'::text collate "C")$$,
  'application and notification changes are available to authorised Realtime subscribers'
);

insert into public.companies (id, name, abn, status)
values
  (
    '86000000-0000-4000-8000-000000000010',
    'CLE-86 Review Company',
    '86000000001',
    'approved'
  ),
  (
    '86000000-0000-4000-8000-000000000020',
    'CLE-86 Foreign Company',
    '86000000002',
    'approved'
  );

insert into public.clients (id, company_id, name)
values (
  '86000000-0000-4000-8000-000000000110',
  '86000000-0000-4000-8000-000000000010',
  'CLE-86 Client'
);

insert into public.sites (id, client_id, name, address, suburb)
values (
  '86000000-0000-4000-8000-000000000401',
  '86000000-0000-4000-8000-000000000110',
  'CLE-86 Site',
  '86 Review Street',
  'Broadbeach'
);

insert into public.company_members (id, company_id, profile_id, status)
values
  (
    '86000000-0000-4000-8000-000000000081',
    '86000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000002',
    'active'
  ),
  (
    '86000000-0000-4000-8000-000000000082',
    '86000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000003',
    'active'
  ),
  (
    '86000000-0000-4000-8000-000000000083',
    '86000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000004',
    'active'
  );

insert into public.employee_memberships (
  id, company_id, profile_id, role, status
) values
  (
    '86000000-0000-4000-8000-000000000091',
    '86000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    'owner',
    'active'
  ),
  (
    '86000000-0000-4000-8000-000000000092',
    '86000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000006',
    'staff',
    'active'
  ),
  (
    '86000000-0000-4000-8000-000000000093',
    '86000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000005',
    'staff',
    'removed'
  ),
  (
    '86000000-0000-4000-8000-000000000094',
    '86000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000005',
    'owner',
    'active'
  );

insert into public.jobs (
  id, site_id, service_id, scheduled_start, duration_minutes,
  cleaner_pay_cents, client_charge_cents, status, crew_size
) values
  (
    '86000000-0000-4000-8000-000000000501',
    '86000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-10-01T08:00:00+10', 60, 9000, 15000, 'posted', 2
  ),
  (
    '86000000-0000-4000-8000-000000000502',
    '86000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-10-02T08:00:00+10', 60, 9000, 15000, 'posted', 1
  );

select set_config(
  'app.settings.push_dispatch_url',
  'http://kong:8000/functions/v1/push-dispatch',
  true
);
select set_config('app.settings.push_dispatch_bearer', 'cle-86-test-secret', true);
delete from net.http_request_queue;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_job('86000000-0000-4000-8000-000000000501')$$,
  'an active pool cleaner applies to the posted crew-two job'
);
reset role;

select results_eq(
  $$select
      (select count(*)::integer
         from public.job_applications
        where job_id = '86000000-0000-4000-8000-000000000501'
          and cleaner_id = '10000000-0000-4000-8000-000000000002'
          and status = 'applied'),
      (select count(*)::integer
         from public.job_assignments
        where job_id = '86000000-0000-4000-8000-000000000501'
          and unassigned_at is null),
      (select count(*)::integer
         from public.vacancies
        where job_id = '86000000-0000-4000-8000-000000000501')$$,
  $$values (1, 0, 2)$$,
  'application persists once without reserving either open slot'
);

select results_eq(
  $$select recipient_id, read_at is null
      from public.notifications
     where job_id = '86000000-0000-4000-8000-000000000501'
       and type::text = 'application_received'
     order by recipient_id$$,
  $$values
    ('10000000-0000-4000-8000-000000000001'::uuid, true),
    ('10000000-0000-4000-8000-000000000006'::uuid, true)$$,
  'each active company employee receives one unread durable application notification'
);

select is(
  (
    select count(*)::integer
      from public.notifications
     where job_id = '86000000-0000-4000-8000-000000000501'
       and recipient_id = '10000000-0000-4000-8000-000000000005'
  ),
  0,
  'removed employees receive no application notification'
);

select is(
  (
    select count(*)::integer
      from net.http_request_queue
     where (convert_from(body, 'UTF8')::jsonb ->> 'jobId')
       = '86000000-0000-4000-8000-000000000501'
  ),
  0,
  'ordinary application notifications never enqueue web push'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.apply_to_job('86000000-0000-4000-8000-000000000501')$$,
  '23505',
  'Cleaner can apply only once per job',
  'a retry cannot duplicate an application or its employee notifications'
);
reset role;

select results_eq(
  $$select
      (select count(*)::integer
         from public.job_applications
        where job_id = '86000000-0000-4000-8000-000000000501'
          and cleaner_id = '10000000-0000-4000-8000-000000000002'),
      (select count(*)::integer
         from public.notifications
        where job_id = '86000000-0000-4000-8000-000000000501'
          and type::text = 'application_received')$$,
  $$values (1, 2)$$,
  'duplicate apply leaves one application and one notification per active employee'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
      from public.job_applications
     where job_id = '86000000-0000-4000-8000-000000000501'
  ),
  1,
  'an active company owner can read the application queue'
);
select is(
  (
    select count(*)::integer
      from public.notifications
     where job_id = '86000000-0000-4000-8000-000000000501'
  ),
  1,
  'an employee sees only her own durable application notification'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
      from public.job_applications
     where job_id = '86000000-0000-4000-8000-000000000501'
  ),
  1,
  'the cleaner can still read her own application'
);
select is(
  (
    select count(*)::integer
      from public.notifications
     where job_id = '86000000-0000-4000-8000-000000000501'
       and type::text = 'application_received'
  ),
  0,
  'the applicant cannot read employee application notifications'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.approve_job_application(
      '86000000-0000-4000-8000-000000000501',
      1,
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '42501',
  'Company admin access required',
  'a foreign-company owner cannot approve the application'
);
select throws_ok(
  $$select public.mark_job_application_not_selected(
      '86000000-0000-4000-8000-000000000501',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '42501',
  'Company admin access required',
  'a removed own-company employee and foreign-company owner cannot review the application'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.mark_job_application_not_selected(
      '86000000-0000-4000-8000-000000000501',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  'an employee marks an awaiting response not selected'
);
select lives_ok(
  $$select public.mark_job_application_not_selected(
      '86000000-0000-4000-8000-000000000501',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  'replaying not selected is idempotent'
);
reset role;

select results_eq(
  $$select application.status::text,
           application.resolved_at is not null,
           (select count(*)::integer
              from public.job_assignments assignment
             where assignment.job_id = application.job_id),
           (select count(*)::integer
              from public.vacancies vacancy
             where vacancy.job_id = application.job_id),
           (select count(*)::integer
              from public.notifications notification
             where notification.job_id = application.job_id
               and notification.type::text = 'application_received')
      from public.job_applications application
     where application.job_id = '86000000-0000-4000-8000-000000000501'
       and application.cleaner_id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('not_selected'::text, true, 0, 2, 2)$$,
  'not selected resolves only the response, without assignment, vacancy, reason, or notification side effects'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.restore_job_application(
      '86000000-0000-4000-8000-000000000501',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '42501',
  'Company admin access required',
  'a foreign-company owner cannot restore the application'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.restore_job_application(
      '86000000-0000-4000-8000-000000000501',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  'an employee restores a response while the posted job has open slots'
);
select lives_ok(
  $$select public.restore_job_application(
      '86000000-0000-4000-8000-000000000501',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  'replaying restore is idempotent'
);
reset role;

select results_eq(
  $$select status::text, resolved_at is null, withdrawn_at is null,
           (select count(*)::integer
              from public.notifications
             where job_id = application.job_id
               and type::text = 'application_received')
      from public.job_applications application
     where job_id = '86000000-0000-4000-8000-000000000501'
       and cleaner_id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('applied'::text, true, true, 2)$$,
  'restore returns the response to awaiting without repeating arrival notifications'
);

delete from net.http_request_queue;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.approve_job_application(
      '86000000-0000-4000-8000-000000000501',
      1,
      '10000000-0000-4000-8000-000000000002'
    )$$,
  'approval immediately assigns the consenting applicant to the selected open slot'
);
reset role;

select results_eq(
  $$select job.status::text,
           application.status::text,
           assignment.slot_number,
           (select count(*)::integer
              from public.vacancies
             where job_id = job.id),
           (select count(*)::integer
              from public.notifications
             where job_id = job.id
               and recipient_id = application.cleaner_id
               and type = 'job_assigned')
      from public.jobs job
      join public.job_applications application on application.job_id = job.id
      join public.job_assignments assignment
        on assignment.job_id = job.id
       and assignment.cleaner_id = application.cleaner_id
       and assignment.unassigned_at is null
     where job.id = '86000000-0000-4000-8000-000000000501'
       and application.cleaner_id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('posted'::text, 'assigned'::text, 1, 1, 1)$$,
  'partial approval atomically resolves the response, fills one slot, and retains one vacancy'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.mark_job_application_not_selected(
      '86000000-0000-4000-8000-000000000501',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '23514',
  'Application is no longer awaiting review',
  'an assigned response cannot be marked not selected'
);
select throws_ok(
  $$select public.restore_job_application(
      '86000000-0000-4000-8000-000000000501',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '23514',
  'Application cannot be restored',
  'an assigned response cannot be restored'
);
select throws_ok(
  $$select public.approve_job_application(
      '86000000-0000-4000-8000-000000000501',
      2,
      '10000000-0000-4000-8000-000000000004'
    )$$,
  '23514',
  'Application is no longer awaiting review',
  'a non-applicant cannot enter the approval path'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_job('86000000-0000-4000-8000-000000000501')$$,
  'a second cleaner applies for the remaining slot'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.assign_job_slot(
      '86000000-0000-4000-8000-000000000501',
      2,
      '10000000-0000-4000-8000-000000000004'
    )$$,
  '42501',
  'permission denied for function assign_job_slot',
  'an authenticated employee cannot assign a non-applicant directly'
);
select lives_ok(
  $$select public.approve_job_application(
      '86000000-0000-4000-8000-000000000501',
      2,
      '10000000-0000-4000-8000-000000000003'
    )$$,
  'application approval still fills the final slot without the direct-assignment grant'
);
select throws_ok(
  $$select public.restore_job_application(
      '86000000-0000-4000-8000-000000000501',
      '10000000-0000-4000-8000-000000000003'
    )$$,
  '23514',
  'Job is not open for application review',
  'a response cannot be restored after the final vacancy closes'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_job('86000000-0000-4000-8000-000000000502')$$,
  'a cleaner applies to the second posted job'
);
select lives_ok(
  $$select public.withdraw_application('86000000-0000-4000-8000-000000000502')$$,
  'the applicant withdraws from the second job'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.restore_job_application(
      '86000000-0000-4000-8000-000000000502',
      '10000000-0000-4000-8000-000000000004'
    )$$,
  '23514',
  'Application cannot be restored',
  'a withdrawn response remains terminal'
);
select throws_ok(
  $$select public.approve_job_application(
      '86000000-0000-4000-8000-000000000502',
      0,
      '10000000-0000-4000-8000-000000000004'
    )$$,
  '23514',
  'Application is no longer awaiting review',
  'invalid or stale approval leaves the withdrawn response unchanged'
);
reset role;

select results_eq(
  $$select status::text,
           (select count(*)::integer
              from public.job_assignments
             where job_id = application.job_id),
           (select count(*)::integer
              from public.notifications
             where job_id = application.job_id
               and recipient_id = application.cleaner_id
               and type = 'job_assigned')
      from public.job_applications application
     where job_id = '86000000-0000-4000-8000-000000000502'
       and cleaner_id = '10000000-0000-4000-8000-000000000004'$$,
  $$values ('withdrawn'::text, 0, 0)$$,
  'rejected restore and approval attempts leave all assignment side effects absent'
);

select * from finish();
rollback;
