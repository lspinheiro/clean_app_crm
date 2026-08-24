begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

create temporary table company_status_authorization_baseline on commit drop as
select
  (select name from public.companies where id = '10000000-0000-4000-8000-000000000010') as company_name,
  (select name from public.clients where id = '10000000-0000-4000-8000-000000000301') as client_name,
  (select address from public.sites where id = '10000000-0000-4000-8000-000000000401') as site_address,
  (
    select code
    from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null
  ) as invite_code;

delete from public.site_preferred_cleaners
where site_id = '10000000-0000-4000-8000-000000000401';

insert into public.site_preferred_cleaners (site_id, cleaner_id, rank)
values (
  '10000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000002',
  1
)
on conflict (site_id, cleaner_id) do update set rank = excluded.rank;

update public.companies
set status = 'pending'
where id = '10000000-0000-4000-8000-000000000010';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  not public.is_company_admin('10000000-0000-4000-8000-000000000010'),
  'a pending company does not grant operational company-admin access'
);
reset role;

update public.companies
set status = 'suspended'
where id = '10000000-0000-4000-8000-000000000010';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  not public.is_company_admin('10000000-0000-4000-8000-000000000010'),
  'a suspended company does not grant operational company-admin access'
);
select is((select count(*)::integer from public.companies), 0, 'suspended admin cannot read the company row');
select is(
  (select count(*)::integer from public.profiles where id <> auth.uid()),
  0,
  'suspended admin cannot read pool cleaner profiles'
);
select is((select count(*)::integer from public.company_members), 0, 'suspended admin cannot read memberships');
select is((select count(*)::integer from public.company_invites), 0, 'suspended admin cannot read invite history');
select is((select count(*)::integer from public.clients), 0, 'suspended admin cannot read client data');
select is((select count(*)::integer from public.sites), 0, 'suspended admin cannot read site data');
select is(
  (select count(*)::integer from public.site_preferred_cleaners),
  0,
  'suspended admin cannot read preferred cleaners'
);
select is((select count(*)::integer from public.jobs), 0, 'suspended admin cannot read jobs');
select is(
  (select count(*)::integer from public.job_assignments),
  0,
  'suspended admin cannot read job assignments'
);
select is(
  (select count(*)::integer from public.vacancies),
  0,
  'suspended admin cannot read vacancies'
);
select is(
  (select count(*)::integer from public.recurring_assignments),
  0,
  'suspended admin cannot read recurring assignments'
);
select is(
  (select count(*)::integer from public.recurring_assignment_cleaners),
  0,
  'suspended admin cannot read named recurring slots'
);
select ok(
  not public.can_manage_company_logo('10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'),
  'suspended admin cannot manage the company logo'
);

select throws_ok(
  $$select public.update_company_identity(
    '10000000-0000-4000-8000-000000000010',
    'Suspended Company',
    '51824753556',
    null
  )$$,
  '42501',
  'Company admin access required',
  'suspended admin cannot update company identity'
);
select throws_ok(
  $$select public.create_client(
    '10000000-0000-4000-8000-000000000010',
    'Suspended Client', null, null, null
  )$$,
  '42501',
  'Company admin access required',
  'suspended admin cannot create a client'
);
select throws_ok(
  $$select public.create_site(
    '10000000-0000-4000-8000-000000000301',
    'Suspended Site', '1 Test Street', 'Robina', null
  )$$,
  '42501',
  'Company admin access required',
  'suspended admin cannot create a site'
);
select throws_ok(
  $$select public.update_client(
    '10000000-0000-4000-8000-000000000301',
    'Suspended Edit', null, null, null
  )$$,
  '42501',
  'Company admin access required',
  'suspended admin cannot update a client'
);
select throws_ok(
  $$select public.update_site(
    '10000000-0000-4000-8000-000000000401',
    'Suspended Edit', '2 Test Street', 'Robina', null,
    '30000000-0000-4000-8000-000000000001', 60, 10000
  )$$,
  '42501',
  'Company admin access required',
  'suspended admin cannot update a site or its defaults'
);
select throws_ok(
  $$select public.set_site_preferred_cleaners(
    '10000000-0000-4000-8000-000000000401',
    array[]::uuid[]
  )$$,
  '42501',
  'Company admin access required',
  'suspended admin cannot replace preferred cleaners'
);
select throws_ok(
  $$select public.rotate_company_invite('10000000-0000-4000-8000-000000000010')$$,
  '42501',
  'Company admin access required',
  'suspended admin cannot rotate the pool invite'
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
  'suspended admin cannot create a recurring assignment'
);
reset role;

select is(
  (select name from public.companies where id = '10000000-0000-4000-8000-000000000010'),
  (select company_name from company_status_authorization_baseline),
  'denied identity mutation leaves the company unchanged'
);
select is(
  (select name from public.clients where id = '10000000-0000-4000-8000-000000000301'),
  (select client_name from company_status_authorization_baseline),
  'denied client mutation leaves the client unchanged'
);
select is(
  (select address from public.sites where id = '10000000-0000-4000-8000-000000000401'),
  (select site_address from company_status_authorization_baseline),
  'denied site mutation leaves the site unchanged'
);
select is(
  (
    select code
    from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null
  ),
  (select invite_code from company_status_authorization_baseline),
  'denied rotation leaves the active invite unchanged'
);
select results_eq(
  $$select cleaner_id, rank
    from public.site_preferred_cleaners
    where site_id = '10000000-0000-4000-8000-000000000401'$$,
  $$values ('10000000-0000-4000-8000-000000000002'::uuid, 1)$$,
  'denied preference replacement leaves the prior order unchanged'
);
select is(
  (select count(*)::integer from public.clients where name = 'Suspended Client'),
  0,
  'denied client creation leaves no row behind'
);
select is(
  (select count(*)::integer from public.sites where name = 'Suspended Site'),
  0,
  'denied site creation leaves no row behind'
);

select * from finish();
rollback;
