begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- CLE-20 requires that a cleaner in two pools sees both companies' open vacancies. The
-- seed carries a single company, so the case is unreachable from the app; these fixtures
-- build the second pool inside the transaction and roll it back.

insert into public.companies (id, name, abn, status)
values ('40000000-0000-4000-8000-000000000010', 'Second Pool Cleaning', '44444444444', 'approved');
insert into public.clients (id, company_id, name)
values (
  '40000000-0000-4000-8000-000000000301',
  '40000000-0000-4000-8000-000000000010',
  'Second Pool Client'
);
insert into public.sites (id, client_id, name, address, suburb, access_notes)
values (
  '40000000-0000-4000-8000-000000000401',
  '40000000-0000-4000-8000-000000000301',
  'Second Pool Site',
  '99 Hidden Street',
  'Burleigh Heads',
  'Second pool access notes'
);

-- A crew-of-two job with one slot already filled: the board must offer the other one only.
insert into public.jobs (
  id, site_id, service_id, scheduled_start, scheduled_end,
  duration_minutes, cleaner_pay_cents, client_charge_cents, crew_size, status
)
values (
  '40000000-0000-4000-8000-000000000501',
  '40000000-0000-4000-8000-000000000401',
  '30000000-0000-4000-8000-000000000002',
  '2026-09-10T22:00:00+00',
  '2026-09-11T00:00:00+00',
  120, 11000, 26000, 2, 'posted'
);

-- Cleaners One and Three join the second pool; Cleaner Two stays in the first pool only.
insert into public.company_members (company_id, profile_id)
values
  ('40000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000004');

-- Cleaner Three takes slot 1. Assignment is gated on active pool membership, so the
-- occupant has to be a member of that company.
insert into public.job_assignments (job_id, cleaner_id, slot_number, assignment_start, assignment_end)
values (
  '40000000-0000-4000-8000-000000000501',
  '10000000-0000-4000-8000-000000000004',
  1,
  '2026-09-10T22:00:00+00',
  '2026-09-11T00:00:00+00'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(distinct company_name)::integer from public.cleaner_job_board),
  2,
  'a cleaner in two pools sees vacancies from both companies'
);
select ok(
  (
    select count(*) > 0
    from public.cleaner_job_board
    where company_name = 'Second Pool Cleaning'
  ),
  'the second pool contributes its own open work'
);
select is(
  (
    select count(*)::integer
    from public.cleaner_job_board
    where job_id = '40000000-0000-4000-8000-000000000501'
  ),
  1,
  'a crew job with one slot assigned offers only its remaining slot'
);
select is(
  (
    select crew_slot
    from public.cleaner_job_board
    where job_id = '40000000-0000-4000-8000-000000000501'
  ),
  2,
  'the slot offered is the unassigned one'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.cleaner_job_board where company_name = 'Second Pool Cleaning'),
  0,
  'a cleaner outside that pool sees none of its work'
);
reset role;

-- The privacy boundary is structural, but the second pool's data proves it with live rows.
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cleaner_job_board'
      and column_name in ('address', 'access_notes', 'client_phone', 'client_charge_cents')
  ),
  0,
  'the board view carries no address, access notes, client phone, or client charge'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.cleaner_job_board
    where suburb = 'Burleigh Heads'
  ),
  1,
  'the suburb is the one location detail offered before assignment'
);
reset role;

select * from finish();
rollback;
