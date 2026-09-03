begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_column(
  'public', 'recurring_assignment_cleaners', 'accepted_at',
  'named recurring cleaners carry the standing-consent timestamp'
);
select col_type_is(
  'public', 'recurring_assignment_cleaners', 'accepted_at',
  'timestamp with time zone',
  'standing consent uses an auditable timestamp'
);
select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recurring_assignment_cleaners'
      and column_name = 'accepted_at'
  ),
  'YES',
  'a named cleaner remains unconsented until she accepts'
);
select has_function('public', 'offer_series', array['uuid', 'uuid']);
select function_privs_are(
  'public', 'offer_series', array['uuid', 'uuid'],
  'authenticated', array['EXECUTE'],
  'authenticated callers receive only the guarded series-offer capability'
);
select function_privs_are(
  'public', 'offer_series', array['uuid', 'uuid'],
  'anon', array[]::text[],
  'anonymous callers cannot offer a recurring series'
);

create temporary table cle_52_rule_ids (
  label text primary key,
  rule_id uuid not null
) on commit drop;
grant select, insert on table cle_52_rule_ids to authenticated;

create temporary table cle_52_job_ids (
  label text primary key,
  job_id uuid not null
) on commit drop;
grant select on table cle_52_job_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_52_rule_ids
select 'consent', public.create_recurring_assignment(
  '10000000-0000-4000-8000-000000000403',
  '30000000-0000-4000-8000-000000000002',
  'weekly', 5::smallint, '2026-09-04', '03:00', 60, 9000, 1,
  array['10000000-0000-4000-8000-000000000002'::uuid]
);
reset role;

select results_eq(
  $$select named.slot_number, named.cleaner_id, named.accepted_at is null,
           offer.status::text, offer.job_id is null
      from public.recurring_assignment_cleaners named
      join public.offers offer
        on offer.recurring_assignment_id = named.recurring_assignment_id
       and offer.cleaner_id = named.cleaner_id
     where named.recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'consent'
     )$$,
  $$values (
    1,
    '10000000-0000-4000-8000-000000000002'::uuid,
    true,
    'pending'::text,
    true
  )$$,
  'naming a cleaner atomically creates exactly one pending series offer without consent'
);
select is(
  (
    select count(*)::integer
    from public.offers
    where recurring_assignment_id = (
      select rule_id from cle_52_rule_ids where label = 'consent'
    )
      and status = 'pending'
  ),
  1,
  'rule creation sends exactly one series offer'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.offer_series(
    (select rule_id from cle_52_rule_ids where label = 'consent'),
    '10000000-0000-4000-8000-000000000002'
  )$$,
  '42501', 'Company admin access required',
  'a cleaner cannot send a series offer despite the authenticated execute grant'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.update_recurring_assignment(
    (select rule_id from cle_52_rule_ids where label = 'consent'),
    '30000000-0000-4000-8000-000000000002',
    'weekly', 5::smallint, '2026-09-04', '03:00', 75, 9500, 1,
    array['10000000-0000-4000-8000-000000000002'::uuid]
  )$$,
  'editing a rule while retaining its unconsented cleaner succeeds'
);
select throws_ok(
  $$select public.offer_series(
    (select rule_id from cle_52_rule_ids where label = 'consent'),
    '10000000-0000-4000-8000-000000000002'
  )$$,
  '23514', 'Cleaner already has a pending offer for this series',
  'the guarded RPC cannot duplicate a waiting series offer'
);
reset role;

select results_eq(
  $$select count(*)::integer,
           count(*) filter (where status = 'pending')::integer
      from public.offers
     where recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'consent'
     )$$,
  $$values (1, 1)$$,
  'retaining an unconsented named cleaner preserves the one original offer'
);
select ok(
  (
    select count(*) > 0
    from public.jobs
    where recurring_assignment_id = (
      select rule_id from cle_52_rule_ids where label = 'consent'
    )
  ),
  'rule creation generates future instances for the consent scenario'
);
select is(
  (
    select count(*)::integer
    from public.job_assignments assignment
    join public.jobs job on job.id = assignment.job_id
    where job.recurring_assignment_id = (
      select rule_id from cle_52_rule_ids where label = 'consent'
    )
      and assignment.unassigned_at is null
  ),
  0,
  'unconsented series instances are not assigned'
);
select is(
  (
    select count(*)::integer
    from public.vacancies vacancy
    join public.jobs job on job.id = vacancy.job_id
    where job.recurring_assignment_id = (
      select rule_id from cle_52_rule_ids where label = 'consent'
    )
  ),
  0,
  'unconsented series instances are offered rather than projected as vacancies'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.cleaner_job_board
    where job_id in (
      select id from public.jobs
      where recurring_assignment_id = (
        select rule_id from cle_52_rule_ids where label = 'consent'
      )
    )
  ),
  0,
  'the offered cleaner cannot see her waiting series instances on the board'
);
select results_eq(
  $$select status::text, target_kind, recurring_assignment_id
      from public.cleaner_offers
     where recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'consent'
     )$$,
  $$select 'pending'::text, 'recurring_assignment'::text, rule_id
      from cle_52_rule_ids where label = 'consent'$$,
  'the offered cleaner sees one safe series offer through cleaner_offers'
);
reset role;

update public.jobs
set manually_edited_at = clock_timestamp()
where id = (
  select job.id
  from public.jobs job
  where job.recurring_assignment_id = (
    select rule_id from cle_52_rule_ids where label = 'consent'
  )
  order by job.service_date
  limit 1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.accept_offer(
    (
      select offer_id from public.cleaner_offers
      where recurring_assignment_id = (
        select rule_id from cle_52_rule_ids where label = 'consent'
      )
    )
  )$$,
  'the named cleaner can accept the series once as standing consent'
);
reset role;

select results_eq(
  $$select offer.status::text, offer.resolved_at is not null,
           named.accepted_at is not null, rule.generation_version
      from public.offers offer
      join public.recurring_assignment_cleaners named
        on named.recurring_assignment_id = offer.recurring_assignment_id
       and named.cleaner_id = offer.cleaner_id
      join public.recurring_assignments rule
        on rule.id = offer.recurring_assignment_id
     where offer.recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'consent'
     )$$,
  $$values ('accepted'::text, true, true, 3::bigint)$$,
  'acceptance resolves the offer, records consent, and advances reconciliation version'
);
select results_eq(
  $$select
       count(*) filter (where job.manually_edited_at is null)::integer,
       count(*) filter (
         where job.manually_edited_at is null
           and assignment.unassigned_at is null
           and assignment.source = 'recurring'
           and job.status = 'assigned'
       )::integer
     from public.jobs job
     left join public.job_assignments assignment
       on assignment.job_id = job.id
      and assignment.cleaner_id = '10000000-0000-4000-8000-000000000002'
     where job.recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'consent'
     )$$,
  $$select count(*)::integer, count(*)::integer
      from public.jobs
     where recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'consent'
     )
       and manually_edited_at is null$$,
  'acceptance assigns every already-generated instance that has not been touched'
);
select results_eq(
  $$select job.status::text, count(assignment.id)::integer
      from public.jobs job
      left join public.job_assignments assignment
        on assignment.job_id = job.id
       and assignment.unassigned_at is null
     where job.recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'consent'
     )
       and job.manually_edited_at is not null
     group by job.status$$,
  $$values ('posted'::text, 0)$$,
  'acceptance leaves a manually touched generated instance unchanged'
);
select lives_ok(
  $$select public.generate_recurring_jobs_at(
    '2026-09-10T00:00:00+10',
    (select rule_id from cle_52_rule_ids where label = 'consent')
  )$$,
  'later generation runs under the standing consent without another offer'
);
select ok(
  (
    select count(*) > 0
      and bool_and(job.status = 'assigned')
      and bool_and(assignment.source = 'recurring')
    from public.jobs job
    join public.job_assignments assignment
      on assignment.job_id = job.id
     and assignment.unassigned_at is null
    where job.recurring_assignment_id = (
      select rule_id from cle_52_rule_ids where label = 'consent'
    )
      and job.service_date >= '2026-09-25'
  ),
  'future instances generate already assigned after standing consent'
);
select is(
  (
    select count(*)::integer
    from public.offers
    where recurring_assignment_id = (
      select rule_id from cle_52_rule_ids where label = 'consent'
    )
  ),
  1,
  'standing consent never re-offers the recurring series'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_52_rule_ids
select 'decline', public.create_recurring_assignment(
  '10000000-0000-4000-8000-000000000403',
  '30000000-0000-4000-8000-000000000002',
  'weekly', 5::smallint, '2026-09-04', '05:00', 60, 9000, 1,
  array['10000000-0000-4000-8000-000000000003'::uuid]
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.decline_offer(
    (
      select offer_id from public.cleaner_offers
      where recurring_assignment_id = (
        select rule_id from cle_52_rule_ids where label = 'decline'
      )
    )
  )$$,
  'the named cleaner can decline the offered series'
);
reset role;

select results_eq(
  $$select offer.status::text, offer.resolved_at is not null,
           count(named.cleaner_id)::integer
      from public.offers offer
      left join public.recurring_assignment_cleaners named
        on named.recurring_assignment_id = offer.recurring_assignment_id
       and named.cleaner_id = offer.cleaner_id
     where offer.recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'decline'
     )
     group by offer.status, offer.resolved_at$$,
  $$values ('declined'::text, true, 0)$$,
  'decline resolves the offer and removes the cleaner from the rule'
);
select results_eq(
  $$select count(*)::integer,
           count(*) filter (where job.status = 'posted')::integer
      from public.jobs job
     where job.recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'decline'
     )$$,
  $$select count(*)::integer, count(*)::integer
      from public.jobs
     where recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'decline'
     )$$,
  'declining reconciles all untouched generated instances to posted'
);
select results_eq(
  $$select count(*)::integer
      from public.vacancies vacancy
      join public.jobs job on job.id = vacancy.job_id
     where job.recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'decline'
     )$$,
  $$select count(*)::integer
      from public.jobs
     where recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'decline'
     )$$,
  'declining turns every untouched offered instance into a visible vacancy'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select count(*)::integer
      from public.cleaner_job_board
     where job_id in (
       select id from public.jobs
       where recurring_assignment_id = (
         select rule_id from cle_52_rule_ids where label = 'decline'
       )
     )$$,
  $$select count(*)::integer
      from public.jobs
     where recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'decline'
     )$$,
  'declined series instances reappear on the cleaner board'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_52_rule_ids
select 'revoke', public.create_recurring_assignment(
  '10000000-0000-4000-8000-000000000403',
  '30000000-0000-4000-8000-000000000002',
  'weekly', 5::smallint, '2026-09-04', '06:00', 60, 9000, 1,
  array['10000000-0000-4000-8000-000000000004'::uuid]
);
select lives_ok(
  $$select public.revoke_offer(
    (
      select offer.id
      from public.offers offer
      where offer.recurring_assignment_id = (
        select rule_id from cle_52_rule_ids where label = 'revoke'
      )
        and offer.status = 'pending'
    )
  )$$,
  'a company admin can directly revoke a pending series offer'
);
reset role;

select results_eq(
  $$select status::text, resolved_at is not null
      from public.offers
     where recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'revoke'
     )$$,
  $$values ('revoked'::text, true)$$,
  'direct series revocation records the terminal offer state'
);
select is(
  (
    select count(*)::integer
    from public.recurring_assignment_cleaners
    where recurring_assignment_id = (
      select rule_id from cle_52_rule_ids where label = 'revoke'
    )
      and cleaner_id = '10000000-0000-4000-8000-000000000004'
  ),
  0,
  'direct series revocation removes the unconsented named-cleaner row'
);
select ok(
  (
    select count(*) > 0
      and count(*) = (
        select count(*)
        from public.vacancies vacancy
        where vacancy.job_id in (
          select job.id
          from public.jobs job
          where job.recurring_assignment_id = rule.id
        )
      )
    from public.jobs job
    join public.recurring_assignments rule
      on rule.id = job.recurring_assignment_id
    where rule.id = (
      select rule_id from cle_52_rule_ids where label = 'revoke'
    )
    group by rule.id
  ),
  'direct series revocation returns every affected instance as a vacancy'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select count(*)::integer
      from public.cleaner_job_board
     where job_id in (
       select id from public.jobs
       where recurring_assignment_id = (
         select rule_id from cle_52_rule_ids where label = 'revoke'
       )
     )$$,
  $$select count(*)::integer
      from public.jobs
     where recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'revoke'
     )$$,
  'directly revoked series instances reappear on the cleaner job board'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_52_rule_ids
select 'remove', public.create_recurring_assignment(
  '10000000-0000-4000-8000-000000000403',
  '30000000-0000-4000-8000-000000000002',
  'weekly', 5::smallint, '2026-09-04', '07:00', 60, 9000, 1,
  array[]::uuid[]
);
select lives_ok(
  $$select public.update_recurring_assignment(
    (select rule_id from cle_52_rule_ids where label = 'remove'),
    '30000000-0000-4000-8000-000000000002',
    'weekly', 5::smallint, '2026-09-04', '07:00', 60, 9000, 1,
    array['10000000-0000-4000-8000-000000000004'::uuid]
  )$$,
  'adding a named cleaner by rule edit atomically sends her series offer'
);
select lives_ok(
  $$select public.update_recurring_assignment(
    (select rule_id from cle_52_rule_ids where label = 'remove'),
    '30000000-0000-4000-8000-000000000002',
    'weekly', 5::smallint, '2026-09-04', '07:00', 60, 9000, 1,
    array[]::uuid[]
  )$$,
  'removing the unconsented named cleaner succeeds atomically'
);
reset role;

select results_eq(
  $$select status::text, resolved_at is not null
      from public.offers
     where recurring_assignment_id = (
       select rule_id from cle_52_rule_ids where label = 'remove'
     )$$,
  $$values ('revoked'::text, true)$$,
  'rule edit removal revokes the cleaner waiting series offer'
);
select is(
  (
    select count(*)::integer
    from public.recurring_assignment_cleaners
    where recurring_assignment_id = (
      select rule_id from cle_52_rule_ids where label = 'remove'
    )
  ),
  0,
  'rule edit removal also removes the named-cleaner row'
);

-- A named cleaner who takes a board vacancy must not remain a projected reservation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_52_rule_ids
select 'assigned_named', public.create_recurring_assignment(
  '10000000-0000-4000-8000-000000000403',
  '30000000-0000-4000-8000-000000000002',
  'weekly', 5::smallint, '2026-09-04', '11:00', 60, 9000, 3,
  array[
    '10000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid
  ]
);
reset role;

insert into cle_52_job_ids
select 'assigned_named', job.id
from public.jobs job
where job.recurring_assignment_id = (
  select rule_id from cle_52_rule_ids where label = 'assigned_named'
)
order by job.service_date
limit 1;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.accept_offer(
    (
      select offer_id from public.cleaner_offers
      where recurring_assignment_id = (
        select rule_id from cle_52_rule_ids where label = 'assigned_named'
      )
    )
  )$$,
  'the first named cleaner accepts the crew-three series'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.cleaner_job_board
    where job_id = (
      select job_id from cle_52_job_ids where label = 'assigned_named'
    )
  ),
  1,
  'the unconsented named cleaner can see the genuinely open board vacancy'
);
select lives_ok(
  $$select public.apply_to_job(
    (
      select job_id from cle_52_job_ids where label = 'assigned_named'
    )
  )$$,
  'the unconsented named cleaner can apply for that board vacancy'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.approve_job_application(
    (
      select job_id from cle_52_job_ids where label = 'assigned_named'
    ),
    (
      select vacancy.crew_slot
      from public.vacancies vacancy
      where vacancy.job_id = (
        select job_id from cle_52_job_ids where label = 'assigned_named'
      )
      order by vacancy.crew_slot
      limit 1
    ),
    '10000000-0000-4000-8000-000000000003'
  )$$,
  'the admin approves the named cleaner into the visible open slot'
);
reset role;

select results_eq(
  $$select job.status::text,
           count(assignment.id)::integer,
           (select count(*)::integer
              from public.vacancies vacancy
             where vacancy.job_id = job.id)
      from public.jobs job
      left join public.job_assignments assignment
        on assignment.job_id = job.id
       and assignment.unassigned_at is null
     where job.id = (
       select job_id from cle_52_job_ids where label = 'assigned_named'
     )
     group by job.id, job.status$$,
  $$values ('posted'::text, 2, 1)$$,
  'an assigned named cleaner no longer hides the remaining uncovered slot from vacancies'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.cleaner_job_board
    where job_id = (
      select job_id from cle_52_job_ids where label = 'assigned_named'
    )
  ),
  1,
  'another cleaner sees the remaining uncovered slot on the board'
);
reset role;

-- A job offer and an unconsented named row for one cleaner reserve one crew place.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_52_rule_ids
select 'double_reserved', public.create_recurring_assignment(
  '10000000-0000-4000-8000-000000000403',
  '30000000-0000-4000-8000-000000000002',
  'weekly', 5::smallint, '2026-09-04', '15:00', 60, 9000, 3,
  array[
    '10000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid
  ]
);
reset role;

insert into cle_52_job_ids
select 'double_reserved', job.id
from public.jobs job
where job.recurring_assignment_id = (
  select rule_id from cle_52_rule_ids where label = 'double_reserved'
)
order by job.service_date
limit 1;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.accept_offer(
    (
      select offer_id from public.cleaner_offers
      where recurring_assignment_id = (
        select rule_id from cle_52_rule_ids where label = 'double_reserved'
      )
    )
  )$$,
  'the first named cleaner accepts the double-reservation series'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.vacancies vacancy
    where vacancy.job_id = (
      select job_id from cle_52_job_ids where label = 'double_reserved'
    )
  ),
  1,
  'one unconsented named cleaner reserves one of the two open slots'
);

-- A swallowed 23P01 inside accept_offer's exception block leaves the cleaner rostered on
-- nothing while the RPC still reports success, and the fixture above is the only place in
-- the suite that would ever provoke it. Assert the failure log stays empty, and surface the
-- SQLSTATE when it does not, so the next collision is diagnosed rather than rediscovered.
select is(
  (
    select failure.error_code
    from public.recurring_generation_failures failure
    where failure.recurring_assignment_id = (
      select rule_id from cle_52_rule_ids where label = 'double_reserved'
    )
  ),
  null::text,
  'accepting the series rosters cleanly, with no swallowed generation failure'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.offer_job(
    (
      select job_id from cle_52_job_ids where label = 'double_reserved'
    ),
    '10000000-0000-4000-8000-000000000003'
  )$$,
  'the admin can send a job offer to the same unconsented named cleaner'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.vacancies vacancy
    where vacancy.job_id = (
      select job_id from cle_52_job_ids where label = 'double_reserved'
    )
  ),
  1,
  'duplicate reservation sources for one cleaner still leave the true vacancy visible'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.cleaner_job_board
    where job_id = (
      select job_id from cle_52_job_ids where label = 'double_reserved'
    )
  ),
  1,
  'duplicate reservation sources do not hide the true vacancy from another cleaner'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000403',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 5::smallint, '2026-09-04', '09:00', 60, 9000, 1,
    array['10000000-0000-4000-8000-000000000005'::uuid]
  )$$,
  '23514', 'Named cleaners must be active pool members of the site company',
  'an invalid named cleaner aborts the create-and-offer mutation'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.recurring_assignments
    where site_id = '10000000-0000-4000-8000-000000000403'
      and local_start_time = '09:00'
      and anchor_date = '2026-09-04'
  ),
  0,
  'a failed create leaves no partial recurring rule'
);
select is(
  (
    select count(*)::integer
    from public.offers
    where cleaner_id = '10000000-0000-4000-8000-000000000005'
      and recurring_assignment_id is not null
  ),
  0,
  'a failed create leaves no partial series offer'
);

select * from finish();
rollback;
