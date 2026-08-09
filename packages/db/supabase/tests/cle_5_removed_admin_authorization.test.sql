begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

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
reset role;

select is(
  (select count(*)::integer from public.clients where name = 'Removed Admin Client'),
  0,
  'removed-admin mutation attempts leave no row behind'
);

select * from finish();
rollback;
