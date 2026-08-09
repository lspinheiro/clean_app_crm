begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

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
  4,
  'seed accounts are deterministic and explicitly local-only'
);

select * from finish();
rollback;
