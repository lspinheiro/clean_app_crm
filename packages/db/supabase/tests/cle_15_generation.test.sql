begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name in (
        'recurring_assignment_id',
        'service_date',
        'generated_rule_version',
        'generated_at',
        'manually_edited_at',
        'cancelled_by_rule_deactivation_at'
      )
  ),
  6,
  'jobs retain complete recurrence provenance and manual-touch state'
);
select results_eq(
  $$select enumlabel::text collate "C"
    from pg_enum
    where enumtypid = 'public.assignment_source'::regtype
    order by enumsortorder$$,
  $$values
    ('manual'::text collate "C"),
    ('recurring'::text collate "C")$$,
  'job assignments distinguish manual and recurring sources'
);
select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_assignments'
      and column_name = 'source'
  ),
  '''manual''::assignment_source',
  'existing and direct assignments default to manual provenance'
);
select is(
  (
    select count(*)::integer
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name in (
        'reconcile_recurring_assignment_jobs',
        'generate_recurring_jobs_at',
        'generate_recurring_jobs'
      )
  ),
  3,
  'deterministic reconciliation and nightly generation entry points exist'
);
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.jobs'::regclass
      and conname in (
        'jobs_recurring_provenance_complete',
        'jobs_recurring_assignment_service_date_key'
      )
  ),
  2,
  'generated jobs require complete provenance and one row per rule service date'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.generate_recurring_jobs_at(timestamptz,uuid)',
    'EXECUTE'
  )
    and has_function_privilege(
      'service_role',
      'public.generate_recurring_jobs()',
      'EXECUTE'
    ),
  'service role can run deterministic and nightly generation'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.generate_recurring_jobs_at(timestamptz,uuid)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'authenticated',
      'public.generate_recurring_jobs()',
      'EXECUTE'
    ),
  'authenticated users cannot invoke the generation engine directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.generate_recurring_jobs_at(timestamptz,uuid)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'public.generate_recurring_jobs()',
      'EXECUTE'
    ),
  'anonymous users cannot invoke the generation engine'
);
select results_eq(
  $$select schedule, command, active
    from cron.job
    where jobname = 'generate-recurring-jobs-brisbane'$$,
  $$values ('5 14 * * *'::text, 'select public.generate_recurring_jobs()'::text, true)$$,
  'nightly generation runs at 00:05 Australia/Brisbane'
);
select is(
  (
    select count(*)::integer
    from pg_proc procedure
    where (
      procedure.oid in (
        'public.reconcile_recurring_assignment_jobs(uuid,timestamptz)'::regprocedure,
        'public.generate_recurring_jobs_at(timestamptz,uuid)'::regprocedure,
        'public.generate_recurring_jobs()'::regprocedure,
        'public.create_recurring_assignment(uuid,uuid,public.recurrence_frequency,smallint,date,time without time zone,integer,integer,integer,uuid[])'::regprocedure,
        'public.update_recurring_assignment(uuid,uuid,public.recurrence_frequency,smallint,date,time without time zone,integer,integer,integer,uuid[])'::regprocedure,
        'public.set_recurring_assignment_active(uuid,boolean)'::regprocedure
      )
      or procedure.oid in (
        select trigger.tgfoid
        from pg_trigger trigger
        where trigger.tgrelid in (
          'public.jobs'::regclass,
          'public.job_assignments'::regclass,
          'public.recurring_assignments'::regclass,
          'public.recurring_assignment_cleaners'::regclass,
          'public.company_members'::regclass,
          'public.profiles'::regclass
        )
          and not trigger.tgisinternal
      )
    )
      and case
        when procedure.prokind = 'f' then pg_get_functiondef(procedure.oid)
        else ''
      end ~* '(pg_notify|pg_net|http|push|notification|outbox)'
  ),
  0,
  'generation and rule mutations have no notification or outbound side effect'
);
select ok(
  to_regclass('public.recurring_generation_failures') is not null
    and (
      select relrowsecurity
      from pg_class
      where oid = 'public.recurring_generation_failures'::regclass
    ),
  'nightly per-rule generation failures have a durable RLS-protected surface'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.recurring_generation_failures',
    'SELECT,INSERT,UPDATE,DELETE'
  )
    and not has_table_privilege(
      'authenticated',
      'public.recurring_generation_failures',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
  'only the service boundary can inspect or mutate generation failures'
);

delete from public.notifications where ledger_entry_id is not null;
delete from public.ledger_entries;
delete from public.job_assignments;
delete from public.jobs;
delete from public.recurring_assignments;

insert into public.recurring_assignments (
  id, site_id, service_id, frequency, weekday, anchor_date,
  local_start_time, duration_minutes, cleaner_pay_cents, crew_size
)
values
  (
    '51000000-0000-4000-8000-000000000701',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 1, '2026-08-10', '08:00', 120, 12000, 2
  ),
  (
    '51000000-0000-4000-8000-000000000702',
    '10000000-0000-4000-8000-000000000404',
    '30000000-0000-4000-8000-000000000001',
    'fortnightly', 3, '2026-08-12', '17:30', 90, 9500, 1
  );
insert into public.recurring_assignment_cleaners (
  recurring_assignment_id, slot_number, cleaner_id, accepted_at
)
values
  (
    '51000000-0000-4000-8000-000000000701', 1,
    '10000000-0000-4000-8000-000000000002', clock_timestamp()
  ),
  (
    '51000000-0000-4000-8000-000000000702', 1,
    '10000000-0000-4000-8000-000000000003', clock_timestamp()
  );

select lives_ok(
  $$select public.generate_recurring_jobs_at('2026-08-09T14:30:00Z')$$,
  'the deterministic engine generates two sites in one run'
);
select is(
  (select count(*)::integer from public.jobs),
  6,
  'the 28-day horizon contains four weekly and two fortnightly jobs'
);
select results_eq(
  $$select service_date
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000701'
    order by service_date$$,
  $$values
    ('2026-08-10'::date),
    ('2026-08-17'::date),
    ('2026-08-24'::date),
    ('2026-08-31'::date)$$,
  'weekly generation covers exactly four service dates in the half-open horizon'
);
select results_eq(
  $$select service_date
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000702'
    order by service_date$$,
  $$values ('2026-08-12'::date), ('2026-08-26'::date)$$,
  'fortnightly generation follows anchor-date congruence'
);
select results_eq(
  $$select distinct
      recurring_assignment_id,
      (scheduled_start at time zone 'Australia/Brisbane')::time
    from public.jobs
    order by recurring_assignment_id$$,
  $$values
    ('51000000-0000-4000-8000-000000000701'::uuid, '08:00'::time),
    ('51000000-0000-4000-8000-000000000702'::uuid, '17:30'::time)$$,
  'stored timestamps retain each Brisbane-local start time'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000701'
      and service_id = '30000000-0000-4000-8000-000000000002'
      and duration_minutes = 120
      and cleaner_pay_cents = 12000
      and crew_size = 2
  ),
  4,
  'generated jobs snapshot service, duration, pay, and crew size from the rule'
);
select is(
  (
    select count(*)::integer
    from public.job_assignments assignment
    join public.jobs job on job.id = assignment.job_id
    where job.recurring_assignment_id in (
      '51000000-0000-4000-8000-000000000701',
      '51000000-0000-4000-8000-000000000702'
    )
      and assignment.source = 'recurring'
      and assignment.unassigned_at is null
  ),
  6,
  'named cleaners are assigned to every generated instance with recurring provenance'
);
select is(
  (
    select count(*)::integer
    from public.vacancies vacancy
    join public.jobs job on job.id = vacancy.job_id
    where job.recurring_assignment_id = '51000000-0000-4000-8000-000000000701'
  ),
  4,
  'the crew-two rule with one named cleaner creates exactly one vacancy per instance'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000702'
      and status = 'assigned'
  ),
  2,
  'fully named instances are assigned instead of posted'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id is not null
      and service_date is not null
      and generated_rule_version = 1
      and generated_at = '2026-08-09T14:30:00Z'
      and manually_edited_at is null
  ),
  6,
  'every generated row records its rule version and generation time'
);

create temporary table cle15_idempotency_baseline as
select
  (select count(*)::integer from public.jobs) as job_count,
  (select count(*)::integer from public.job_assignments) as assignment_history_count,
  (
    select count(*)::integer
    from public.job_assignments
    where unassigned_at is null
  ) as active_assignment_count;
select lives_ok(
  $$select public.generate_recurring_jobs_at('2026-08-09T14:30:00Z')$$,
  'the same generation request can be repeated safely'
);
select is(
  (select count(*)::integer from public.jobs),
  (select job_count from cle15_idempotency_baseline),
  'idempotent generation creates no duplicate jobs'
);
select is(
  (select count(*)::integer from public.job_assignments),
  (select assignment_history_count from cle15_idempotency_baseline),
  'idempotent generation creates no assignment-history churn'
);
select is(
  (
    select count(*)::integer
    from public.job_assignments
    where unassigned_at is null
  ),
  (select active_assignment_count from cle15_idempotency_baseline),
  'idempotent generation retains the same active assignments'
);

insert into public.recurring_assignments (
  id, site_id, service_id, frequency, weekday, anchor_date,
  local_start_time, duration_minutes, cleaner_pay_cents, crew_size
) values (
  '51000000-0000-4000-8000-000000000703',
  '10000000-0000-4000-8000-000000000403',
  '30000000-0000-4000-8000-000000000002',
  'weekly', 1, '2026-08-10', '00:15', 60, 8000, 1
);
select lives_ok(
  $$select public.generate_recurring_jobs_at(
      '2026-08-09T13:59:00Z',
      '51000000-0000-4000-8000-000000000703'
    )$$,
  'generation handles the UTC Sunday to Brisbane Monday boundary'
);
select results_eq(
  $$select service_date, scheduled_start
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000703'
    order by service_date
    limit 1$$,
  $$values ('2026-08-10'::date, '2026-08-09T14:15:00Z'::timestamptz)$$,
  'the boundary job uses the Brisbane service date and correct UTC instant'
);
insert into public.recurring_assignments (
  id, site_id, service_id, frequency, weekday, anchor_date,
  local_start_time, duration_minutes, cleaner_pay_cents, crew_size
) values (
  '51000000-0000-4000-8000-000000000705',
  '10000000-0000-4000-8000-000000000402',
  '30000000-0000-4000-8000-000000000003',
  'weekly', 7, '2026-08-16', '12:00', 60, 8500, 1
);
select lives_ok(
  $$select public.generate_recurring_jobs_at(
      '2026-08-09T14:01:00Z',
      '51000000-0000-4000-8000-000000000705'
    )$$,
  'the horizon starts from the new Brisbane day after the UTC boundary'
);
select results_eq(
  $$select service_date
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000705'
    order by service_date$$,
  $$values
    ('2026-08-16'::date),
    ('2026-08-23'::date),
    ('2026-08-30'::date),
    ('2026-09-06'::date)$$,
  'Brisbane-local horizon includes the far Sunday that a UTC horizon omits'
);

update public.jobs
set status = 'completed'
where recurring_assignment_id = '51000000-0000-4000-8000-000000000701'
  and service_date = '2026-08-10';
update public.jobs
set scheduled_start = '2026-08-16T23:15:00Z'
where recurring_assignment_id = '51000000-0000-4000-8000-000000000701'
  and service_date = '2026-08-17';
update public.jobs
set status = 'in_progress'
where recurring_assignment_id = '51000000-0000-4000-8000-000000000701'
  and service_date = '2026-08-24';
insert into public.jobs (
  site_id, service_id, scheduled_start, duration_minutes, cleaner_pay_cents,
  status, crew_size, recurring_assignment_id, service_date,
  generated_rule_version, generated_at
) values (
  '10000000-0000-4000-8000-000000000401',
  '30000000-0000-4000-8000-000000000002',
  '2026-09-06T22:00:00Z', 120, 12000, 'cancelled', 2,
  '51000000-0000-4000-8000-000000000701', '2026-09-07', 1,
  '2026-08-09T14:30:00Z'
);
create temporary table cle15_protected_jobs as
select id, to_jsonb(job) as snapshot
from public.jobs job
where recurring_assignment_id = '51000000-0000-4000-8000-000000000701'
  and service_date in ('2026-08-10', '2026-08-17', '2026-08-24', '2026-09-07');

update public.recurring_assignments
set
  local_start_time = '10:00',
  duration_minutes = 90,
  cleaner_pay_cents = 13000,
  generation_version = generation_version + 1
where id = '51000000-0000-4000-8000-000000000701';
select lives_ok(
  $$select public.generate_recurring_jobs_at(
      '2026-08-09T14:30:00Z',
      '51000000-0000-4000-8000-000000000701'
    )$$,
  'an edited rule reconciles its future untouched instance'
);
select results_eq(
  $$select
      (scheduled_start at time zone 'Australia/Brisbane')::time,
      duration_minutes,
      cleaner_pay_cents,
      generated_rule_version
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000701'
      and service_date = '2026-08-31'$$,
  $$values ('10:00'::time, 90, 13000, 2::bigint)$$,
  'rule edits update only the future untouched schedule snapshot'
);
select is(
  (
    select count(*)::integer
    from cle15_protected_jobs protected
    join public.jobs job on job.id = protected.id
    where to_jsonb(job) = protected.snapshot
  ),
  4,
  'completed, manually edited, started, and cancelled jobs remain byte-for-byte unchanged'
);
select ok(
  (
    select manually_edited_at is not null
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000701'
      and service_date = '2026-08-17'
  ),
  'editing a generated schedule automatically records a manual touch'
);
select results_eq(
  $$select
      count(*)::integer,
      count(*) filter (where unassigned_at is null)::integer
    from public.job_assignments assignment
    join public.jobs job on job.id = assignment.job_id
    where job.recurring_assignment_id = '51000000-0000-4000-8000-000000000701'
      and job.service_date = '2026-08-31'$$,
  $$values (2, 1)$$,
  'reconciliation keeps assignment history while replacing the active named slot once'
);

insert into public.job_assignments (job_id, slot_number, cleaner_id)
select job.id, 1, '10000000-0000-4000-8000-000000000003'
from public.jobs job
where job.recurring_assignment_id = '51000000-0000-4000-8000-000000000703'
  and job.service_date = '2026-08-10';
update public.recurring_assignments
set active = false, generation_version = generation_version + 1
where id = '51000000-0000-4000-8000-000000000703';
select lives_ok(
  $$select public.generate_recurring_jobs_at(
      '2026-08-09T13:59:00Z',
      '51000000-0000-4000-8000-000000000703'
    )$$,
  'deactivation reconciles future untouched unassigned instances'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000703'
      and status = 'cancelled'
  ),
  3,
  'deactivation cancels every future untouched job with no assignment history'
);
select ok(
  (
    select status = 'posted'
      and manually_edited_at is not null
      and cancelled_by_rule_deactivation_at is null
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000703'
      and service_date = '2026-08-10'
  ),
  'deactivation preserves a generated job that has manual assignment history'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000703'
      and status = 'cancelled'
      and cancelled_by_rule_deactivation_at = '2026-08-09T13:59:00Z'
  ),
  3,
  'rule-deactivation cancellations retain their provenance timestamp'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
create temporary table cle15_immediate_rule (rule_id uuid);
select lives_ok(
  $$insert into cle15_immediate_rule
    select public.create_recurring_assignment(
      '10000000-0000-4000-8000-000000000403',
      '30000000-0000-4000-8000-000000000002',
      'weekly',
      extract(isodow from timezone('Australia/Brisbane', now())::date + 1)::smallint,
      timezone('Australia/Brisbane', now())::date + 1,
      '13:17', 60, 8100, 1, array[]::uuid[]
    )$$,
  'the authenticated create RPC immediately materialises its horizon'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = (select rule_id from cle15_immediate_rule)
  ),
  4,
  'immediate creation materialises four weekly jobs'
);
select lives_ok(
  $$select public.update_recurring_assignment(
      (select rule_id from cle15_immediate_rule),
      '30000000-0000-4000-8000-000000000002',
      'weekly',
      extract(isodow from timezone('Australia/Brisbane', now())::date + 1)::smallint,
      timezone('Australia/Brisbane', now())::date + 1,
      '14:17', 75, 8200, 1, array[]::uuid[]
    )$$,
  'the authenticated edit RPC immediately reconciles its horizon'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = (select rule_id from cle15_immediate_rule)
      and (scheduled_start at time zone 'Australia/Brisbane')::time = '14:17'
      and duration_minutes = 75
      and cleaner_pay_cents = 8200
      and generated_rule_version = 2
  ),
  4,
  'immediate edits update all future untouched instances'
);
select lives_ok(
  $$select public.set_recurring_assignment_active(
      (select rule_id from cle15_immediate_rule), false
    )$$,
  'the authenticated toggle RPC immediately reconciles deactivation'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = (select rule_id from cle15_immediate_rule)
      and status = 'cancelled'
  ),
  4,
  'immediate deactivation cancels every untouched unassigned job'
);
reset role;
update public.jobs
set
  manually_edited_at = clock_timestamp(),
  cancelled_by_rule_deactivation_at = null
where id = (
  select id
  from public.jobs
  where recurring_assignment_id = (select rule_id from cle15_immediate_rule)
  order by service_date
  limit 1
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.set_recurring_assignment_active(
      (select rule_id from cle15_immediate_rule), true
    )$$,
  'reactivation safely restores only rule-deactivation cancellations'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = (select rule_id from cle15_immediate_rule)
      and status = 'posted'
      and cancelled_by_rule_deactivation_at is null
  ),
  3,
  'reactivation restores the untouched generated dates to the roster'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = (select rule_id from cle15_immediate_rule)
      and status = 'cancelled'
      and manually_edited_at is not null
      and cancelled_by_rule_deactivation_at is null
  ),
  1,
  'reactivation preserves a manually cancelled control instance'
);

create temporary table cle15_lifecycle_rule (rule_id uuid);
select lives_ok(
  $$insert into cle15_lifecycle_rule
    select public.create_recurring_assignment(
      '10000000-0000-4000-8000-000000000403',
      '30000000-0000-4000-8000-000000000002',
      'weekly',
      extract(isodow from timezone('Australia/Brisbane', now())::date + 1)::smallint,
      timezone('Australia/Brisbane', now())::date + 1,
      '15:47', 60, 8300, 1,
      array['10000000-0000-4000-8000-000000000004'::uuid]
    )$$,
  'a named recurring RPC sends an offer to the active cleaner'
);
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000004',
  true
);
select lives_ok(
  $$select public.accept_offer(
    (
      select offer.offer_id
      from public.cleaner_offers offer
      where offer.recurring_assignment_id = (
        select rule_id from cle15_lifecycle_rule
      )
        and offer.status = 'pending'
    )
  )$$,
  'the named cleaner accepts the recurring offer before assignment generation'
);
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select cmp_ok(
  (
    select count(*)::integer
    from public.job_assignments assignment
    join public.jobs job on job.id = assignment.job_id
    where job.recurring_assignment_id = (select rule_id from cle15_lifecycle_rule)
      and assignment.unassigned_at is null
  ),
  '>',
  0,
  'the named lifecycle fixture starts with active generated assignments'
);
reset role;

update public.company_members
set status = 'removed'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '10000000-0000-4000-8000-000000000004';
select is(
  (
    select count(*)::integer
    from public.recurring_assignment_cleaners
    where recurring_assignment_id = (select rule_id from cle15_lifecycle_rule)
  ),
  0,
  'removing a pool member opens the named recurring slot'
);
select is(
  (
    select count(*)::integer
    from public.job_assignments assignment
    join public.jobs job on job.id = assignment.job_id
    where job.recurring_assignment_id = (select rule_id from cle15_lifecycle_rule)
      and assignment.unassigned_at is null
  ),
  0,
  'pool removal immediately unassigns that cleaner from future generated jobs'
);
select is(
  (
    select count(*)::integer
    from public.vacancies vacancy
    join public.jobs job on job.id = vacancy.job_id
    where job.recurring_assignment_id = (select rule_id from cle15_lifecycle_rule)
  ),
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = (select rule_id from cle15_lifecycle_rule)
  ),
  'pool removal turns every affected named slot into a vacancy'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.set_recurring_assignment_active(
      (select rule_id from cle15_lifecycle_rule), false
    )$$,
  'a rule can deactivate after its named cleaner was removed'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = (select rule_id from cle15_lifecycle_rule)
      and status = 'cancelled'
  ),
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = (select rule_id from cle15_lifecycle_rule)
  ),
  'deactivation cancels untouched vacancies with recurring-only assignment history'
);

insert into public.recurring_assignments (
  id, site_id, service_id, frequency, weekday, anchor_date,
  local_start_time, duration_minutes, cleaner_pay_cents, crew_size
) values (
  '51000000-0000-4000-8000-000000000704',
  '10000000-0000-4000-8000-000000000403',
  '30000000-0000-4000-8000-000000000002',
  'weekly',
  extract(isodow from timezone('Australia/Brisbane', now())::date + 1)::smallint,
  timezone('Australia/Brisbane', now())::date + 1,
  '19:47', 60, 8400, 2
);
insert into public.recurring_assignment_cleaners (
  recurring_assignment_id, slot_number, cleaner_id, accepted_at
) values
  (
    '51000000-0000-4000-8000-000000000704', 1,
    '10000000-0000-4000-8000-000000000002', clock_timestamp()
  ),
  (
    '51000000-0000-4000-8000-000000000704', 2,
    '10000000-0000-4000-8000-000000000003', clock_timestamp()
  );
select public.generate_recurring_jobs_at(
  clock_timestamp(),
  '51000000-0000-4000-8000-000000000704'
);
update public.company_members
set status = 'removed'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '10000000-0000-4000-8000-000000000002';
select results_eq(
  $$select slot_number, cleaner_id
    from public.recurring_assignment_cleaners
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000704'
    order by slot_number$$,
  $$values (1, '10000000-0000-4000-8000-000000000003'::uuid)$$,
  'removing slot one compacts each surviving named cleaner to contiguous slots'
);
select is(
  (
    select count(*)::integer
    from public.job_assignments assignment
    join public.jobs job on job.id = assignment.job_id
    where job.recurring_assignment_id = '51000000-0000-4000-8000-000000000704'
      and assignment.unassigned_at is null
      and assignment.slot_number = 1
      and assignment.cleaner_id = '10000000-0000-4000-8000-000000000003'
  ),
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000704'
  ),
  'lifecycle reconciliation moves the surviving cleaner to generated slot one'
);
select is(
  (
    select count(*)::integer
    from public.vacancies vacancy
    join public.jobs job on job.id = vacancy.job_id
    where job.recurring_assignment_id = '51000000-0000-4000-8000-000000000704'
      and vacancy.crew_slot = 2
  ),
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id = '51000000-0000-4000-8000-000000000704'
  ),
  'compaction leaves only the trailing crew slot vacant'
);

delete from public.notifications where ledger_entry_id is not null;
delete from public.ledger_entries;
delete from public.job_assignments;
delete from public.jobs;
delete from public.recurring_assignments;
delete from public.recurring_generation_failures;
insert into public.recurring_assignments (
  id, site_id, service_id, frequency, weekday, anchor_date,
  local_start_time, duration_minutes, cleaner_pay_cents, crew_size
) values
  (
    '51000000-0000-4000-8000-000000000710',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 1, '2027-02-01', '18:00', 60, 9000, 1
  ),
  (
    '51000000-0000-4000-8000-000000000711',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 1, '2027-02-01', '20:00', 60, 9000, 1
  ),
  (
    '51000000-0000-4000-8000-000000000712',
    '10000000-0000-4000-8000-000000000402',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 1, '2027-02-01', '20:00', 60, 9000, 1
  ),
  (
    '51000000-0000-4000-8000-000000000713',
    '10000000-0000-4000-8000-000000000404',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 1, '2027-02-01', '22:00', 60, 9000, 1
  );
insert into public.recurring_assignment_cleaners (
  recurring_assignment_id, slot_number, cleaner_id, accepted_at
) values
  (
    '51000000-0000-4000-8000-000000000711', 1,
    '10000000-0000-4000-8000-000000000003', clock_timestamp()
  ),
  (
    '51000000-0000-4000-8000-000000000712', 1,
    '10000000-0000-4000-8000-000000000003', clock_timestamp()
  );
select lives_ok(
  $$select public.generate_recurring_jobs_at('2027-01-31T14:30:00Z')$$,
  'one conflicting rule does not abort the all-rule nightly batch'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where recurring_assignment_id in (
      '51000000-0000-4000-8000-000000000710',
      '51000000-0000-4000-8000-000000000713'
    )
  ),
  8,
  'valid rules before and after the conflict both materialise their complete horizons'
);
select results_eq(
  $$select recurring_assignment_id, count(*)::integer
    from public.jobs
    where recurring_assignment_id in (
      '51000000-0000-4000-8000-000000000711',
      '51000000-0000-4000-8000-000000000712'
    )
    group by recurring_assignment_id
    order by recurring_assignment_id$$,
  $$values
    ('51000000-0000-4000-8000-000000000711'::uuid, 4)$$,
  'the first valid named rule commits while its conflicting peer rolls back'
);
select results_eq(
  $$select recurring_assignment_id, error_code, error_message <> ''
    from public.recurring_generation_failures$$,
  $$values (
    '51000000-0000-4000-8000-000000000712'::uuid,
    '23P01'::text,
    true
  )$$,
  'the failed rule records an actionable exclusion failure for operators'
);
select throws_ok(
  $$select public.generate_recurring_jobs_at(
      '2027-01-31T14:30:00Z',
      '51000000-0000-4000-8000-000000000712'
    )$$,
  '23P01',
  null,
  'a targeted admin-path generation conflict remains atomic and visible'
);

select * from finish();
rollback;
