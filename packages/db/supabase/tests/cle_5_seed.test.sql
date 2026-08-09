begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

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

select * from finish();
rollback;
