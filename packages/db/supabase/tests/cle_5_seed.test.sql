begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is((select count(*)::integer from public.companies), 1, 'seed has exactly one company');
select is(
  (select count(*)::integer from public.companies where status = 'approved' and abn ~ '^[0-9]{11}$'),
  1,
  'seeded company is approved with an 11-digit ABN'
);
select is(
  (select count(*)::integer from public.profiles where role = 'company_admin'),
  1,
  'seed has exactly one company admin'
);
select cmp_ok(
  (select count(*)::integer from public.company_members cm join public.profiles p on p.id = cm.profile_id where p.role = 'cleaner' and cm.status = 'active'),
  '>=',
  3,
  'seed has at least three active demo cleaners'
);
select is(
  (select count(*)::integer from auth.users where email like '%@clean-app.example.test'),
  5,
  'seed accounts are deterministic and explicitly local-only'
);
select ok(
  (
    select count(*) = 1 and bool_and(code ~ '^[A-Z0-9]{6}$')
    from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null
  ),
  'seeded company retains exactly one valid active pool invite'
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

select * from finish();
rollback;
