begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select is((select count(*)::integer from public.companies), 2, 'seed has exactly two companies');
select is(
  (select count(*)::integer from public.companies where status = 'approved' and abn ~ '^[0-9]{11}$'),
  2,
  'seeded companies are approved with 11-digit ABNs'
);
select is(
  (select count(*)::integer from public.employee_memberships where role = 'owner' and status = 'active'),
  2,
  'seed has exactly one active owner for each company'
);
select cmp_ok(
  (select count(*)::integer from public.company_members where status = 'active'),
  '>=',
  4,
  'seed has at least four active demo pool memberships'
);
select is(
  (select count(*)::integer from auth.users where email like '%@clean-app.example.test'),
  7,
  'seed accounts are deterministic and explicitly local-only'
);
select results_eq(
  $$select company.name, profile.email
    from public.employee_memberships membership
    join public.companies company on company.id = membership.company_id
    join public.profiles profile on profile.id = membership.profile_id
    where membership.role = 'owner' and membership.status = 'active'
    order by company.name$$,
  $$values
    ('Coastal Demo Cleaning'::text, 'admin@clean-app.example.test'::text),
    ('Harbour Demo Cleaning'::text, 'owner.harbour@clean-app.example.test'::text)$$,
  'each demo company has its dedicated owner account'
);
select is(
  (
    select count(*)::integer
    from public.employee_memberships membership
    join public.profiles profile on profile.id = membership.profile_id
    where profile.email = 'cleaner.one@clean-app.example.test'
  ),
  0,
  'Demo Cleaner One has no employee membership'
);
select ok(
  (
    select count(*) = 0
    from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null
  ),
  'seeded company retains no active legacy rotating invite'
);
select ok(
  (
    select count(*) = 3 and bool_and(code ~ '^[A-Z0-9]{16}$')
    from public.postings
    where company_id = '10000000-0000-4000-8000-000000000010'
  ),
  'seeded company has one high-entropy posting for each intent'
);
select is(
  (
    select count(*)::integer
    from public.recurring_assignments
    where id in (
      '10000000-0000-4000-8000-000000000701',
      '10000000-0000-4000-8000-000000000702',
      '10000000-0000-4000-8000-000000000703'
    )
  ),
  3,
  'seed has deterministic recurring rules across multiple sites'
);
select results_eq(
  $$select rule.crew_size, count(named.cleaner_id)::integer
    from public.recurring_assignments rule
    left join public.recurring_assignment_cleaners named
      on named.recurring_assignment_id = rule.id
    where rule.id = '10000000-0000-4000-8000-000000000701'
    group by rule.crew_size$$,
  $$values (2, 1)$$,
  'seed includes a crew-two recurring rule with one named cleaner'
);
select is(
  (
    select count(*)::integer
    from public.jobs job
    where job.recurring_assignment_id = '10000000-0000-4000-8000-000000000701'
      and job.status = 'posted'
      and job.crew_size = 2
      and (
        select array_agg(application.cleaner_id order by application.cleaner_id)
        from public.job_applications application
        where application.job_id = job.id
      ) = array[
        '10000000-0000-4000-8000-000000000003'::uuid,
        '10000000-0000-4000-8000-000000000004'::uuid
      ]
      and (
        select count(*)
        from public.job_assignments assignment
        where assignment.job_id = job.id
          and assignment.unassigned_at is null
      ) = 1
      and (
        select count(*)
        from public.vacancies vacancy
        where vacancy.job_id = job.id
      ) = 1
  ),
  1,
  'seed applicants exercise the partially assigned crew-two dispatch job'
);

select results_eq(
  $$select
      job.status::text,
      job.crew_size,
      job.cleaner_pay_cents,
      entry.cleaner_id,
      entry.amount_cents,
      entry.status::text,
      entry.payment_note
    from public.jobs job
    join public.ledger_entries entry on entry.job_id = job.id
    where job.id = '10000000-0000-4000-8000-000000000801'
    order by entry.cleaner_id$$,
  $$values
    (
      'completed'::text,
      2,
      12000,
      '10000000-0000-4000-8000-000000000002'::uuid,
      12000,
      'paid'::text,
      'bank transfer'::text
    ),
    (
      'completed'::text,
      2,
      12000,
      '10000000-0000-4000-8000-000000000003'::uuid,
      12000,
      'owed'::text,
      null::text
    )$$,
  'seed includes one completed crew-two job with exact paid and owed slot records'
);
select is(
  (
    select count(*)::integer
    from public.notifications notification
    join public.ledger_entries entry on entry.id = notification.ledger_entry_id
    where entry.job_id = '10000000-0000-4000-8000-000000000801'
      and entry.cleaner_id = '10000000-0000-4000-8000-000000000002'
      and notification.recipient_id = entry.cleaner_id
      and notification.type = 'payment_marked_paid'
  ),
  1,
  'the seeded paid slot has exactly one linked settlement notification'
);

select * from finish();
rollback;
