begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

update public.company_members
set status = 'removed'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id = '10000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  not public.is_company_admin('10000000-0000-4000-8000-000000000010'),
  'a removed company admin has no operational company-admin access'
);
select is((select count(*)::integer from public.companies), 0, 'removed admin cannot read the company row');
select is((select count(*)::integer from public.clients), 0, 'removed admin cannot read tenant client data');
select is((select count(*)::integer from public.jobs), 0, 'removed admin cannot read jobs');
select is(
  (select count(*)::integer from public.job_assignments),
  0,
  'removed admin cannot read job assignments'
);
select is((select count(*)::integer from public.vacancies), 0, 'removed admin cannot read vacancies');
select is(
  (select count(*)::integer from public.recurring_assignments),
  0,
  'removed admin cannot read recurring assignments'
);
select is(
  (select count(*)::integer from public.recurring_assignment_cleaners),
  0,
  'removed admin cannot read named recurring slots'
);
select ok(
  not public.can_manage_company_logo('10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'),
  'removed admin cannot manage the company logo'
);
select throws_ok(
  $$select public.create_client(
    '10000000-0000-4000-8000-000000000010',
    'Removed Admin Client', null, null, null
  )$$,
  '42501',
  'Company admin access required',
  'removed admin cannot create a client'
);
select throws_ok(
  $$select public.rotate_company_invite('10000000-0000-4000-8000-000000000010')$$,
  '42501',
  'Company admin access required',
  'removed admin cannot rotate the pool invite'
);
select throws_ok(
  $$select public.create_recurring_assignment(
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2::smallint, '2026-08-11', '08:00', 60, 8000, 1,
    array[]::uuid[]
  )$$,
  '42501',
  'Only an active company admin can create recurring assignments',
  'removed admin cannot create a recurring assignment'
);
reset role;

select is(
  (select count(*)::integer from public.clients where name = 'Removed Admin Client'),
  0,
  'removed-admin mutation attempts leave no row behind'
);

select * from finish();
rollback;
