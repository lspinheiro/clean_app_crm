begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_type('public', 'offer_status', 'offers use a dedicated lifecycle enum');
select results_eq(
  $$select enumlabel::text collate "C"
      from pg_enum
     where enumtypid = 'public.offer_status'::regtype
     order by enumsortorder$$,
  $$values
    ('pending'::text collate "C"),
    ('accepted'::text collate "C"),
    ('declined'::text collate "C"),
    ('revoked'::text collate "C")$$,
  'offer lifecycle states are exact and ordered'
);
select results_eq(
  $$select enumlabel::text collate "C"
      from pg_enum
     where enumtypid = 'public.notification_type'::regtype
       and enumlabel in ('offer_received', 'offer_declined', 'job_paid')
     order by enumlabel collate "C"$$,
  $$values
    ('job_paid'::text collate "C"),
    ('offer_declined'::text collate "C"),
    ('offer_received'::text collate "C")$$,
  'the LLD notification enum additions land together without M8 behaviour'
);

select has_table('public', 'offers', 'offers are a company-scoped durable entity');
select columns_are(
  'public',
  'offers',
  array[
    'id', 'company_id', 'cleaner_id', 'job_id', 'recurring_assignment_id',
    'status', 'created_at', 'resolved_at'
  ],
  'offers carry exactly the two target shapes and lifecycle timestamps'
);
select col_type_is(
  'public', 'offers', 'status', 'public.offer_status',
  'offer status uses the dedicated lifecycle enum'
);
select hasnt_column('public', 'offers', 'expires_at', 'offers do not expire automatically');
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.offers'::regclass
      and conname = 'offers_exactly_one_target'
      and contype = 'c'
  ),
  1,
  'exactly one job or recurring-assignment target is required'
);
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.offers'::regclass
      and conname = 'offers_resolution_matches_status'
      and contype = 'c'
  ),
  1,
  'resolved_at is null exactly while an offer is pending'
);
select results_eq(
  $$select indexname::text collate "C"
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'offers'
       and indexname in (
         'offers_pending_job_cleaner_idx',
         'offers_pending_recurring_cleaner_idx'
       )
     order by indexname collate "C"$$,
  $$values
    ('offers_pending_job_cleaner_idx'::text collate "C"),
    ('offers_pending_recurring_cleaner_idx'::text collate "C")$$,
  'one pending offer per target and cleaner is enforced for both target shapes'
);
select results_eq(
  $$select relrowsecurity
      from pg_class
     where oid = 'public.offers'::regclass$$,
  $$values (true)$$,
  'offers have row-level security enabled'
);
select table_privs_are(
  'public', 'offers', 'authenticated', array['SELECT'],
  'authenticated callers can only read offers allowed by policy'
);
select table_privs_are(
  'public', 'offers', 'service_role',
  array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
  'service role retains explicit maintenance access to offers'
);

select has_view('public', 'cleaner_offers', 'cleaners receive offers through a dedicated view');
select table_privs_are(
  'public', 'cleaner_offers', 'authenticated', array['SELECT'],
  'authenticated cleaners receive explicit select on their offer projection'
);
select hasnt_column('public', 'cleaner_offers', 'address', 'offers never expose a site address');
select hasnt_column('public', 'cleaner_offers', 'access_notes', 'offers never expose access notes');
select hasnt_column('public', 'cleaner_offers', 'client_phone', 'offers never expose client phone');
select hasnt_column('public', 'cleaner_offers', 'client_charge_cents', 'offers never expose client charge');

select has_function('public', 'offer_job', array['uuid', 'uuid']);
select has_function('public', 'accept_offer', array['uuid']);
select has_function('public', 'decline_offer', array['uuid']);
select has_function('public', 'revoke_offer', array['uuid']);
select function_privs_are(
  'public', 'offer_job', array['uuid', 'uuid'], 'authenticated', array['EXECUTE'],
  'authenticated employees receive only the job-offer capability'
);
select function_privs_are(
  'public', 'accept_offer', array['uuid'], 'authenticated', array['EXECUTE'],
  'authenticated cleaners receive only the accept capability'
);
select function_privs_are(
  'public', 'decline_offer', array['uuid'], 'authenticated', array['EXECUTE'],
  'authenticated cleaners receive only the decline capability'
);
select function_privs_are(
  'public', 'revoke_offer', array['uuid'], 'authenticated', array['EXECUTE'],
  'authenticated employees receive only the revoke capability'
);
select function_privs_are(
  'public', 'offer_job', array['uuid', 'uuid'], 'anon', array[]::text[],
  'anonymous callers cannot create offers'
);

insert into public.companies (id, name, abn, status)
values
  ('51000000-0000-4000-8000-000000000010', 'CLE-51 Offers Company', '51000000001', 'approved'),
  ('51000000-0000-4000-8000-000000000020', 'CLE-51 Foreign Company', '51000000002', 'approved');

insert into public.employee_memberships (id, company_id, profile_id, role, status)
values
  (
    '51000000-0000-4000-8000-000000000091',
    '51000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001', 'owner', 'active'
  ),
  (
    '51000000-0000-4000-8000-000000000092',
    '51000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000006', 'staff', 'active'
  ),
  (
    '51000000-0000-4000-8000-000000000093',
    '51000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000007', 'owner', 'active'
  );

insert into public.company_members (id, company_id, profile_id, status)
values
  (
    '51000000-0000-4000-8000-000000000081',
    '51000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000002', 'active'
  ),
  (
    '51000000-0000-4000-8000-000000000082',
    '51000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000003', 'active'
  ),
  (
    '51000000-0000-4000-8000-000000000083',
    '51000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000004', 'active'
  ),
  (
    '51000000-0000-4000-8000-000000000084',
    '51000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000005', 'removed'
  );

insert into public.clients (id, company_id, name)
values (
  '51000000-0000-4000-8000-000000000110',
  '51000000-0000-4000-8000-000000000010',
  'CLE-51 Client'
);
insert into public.sites (id, client_id, name, address, suburb, access_notes)
values (
  '51000000-0000-4000-8000-000000000401',
  '51000000-0000-4000-8000-000000000110',
  'CLE-51 Site', '51 Private Street', 'Robina', 'Secret access note'
);

insert into public.jobs (
  id, site_id, service_id, scheduled_start, duration_minutes,
  cleaner_pay_cents, client_charge_cents, status, crew_size
)
select
  job_id,
  '51000000-0000-4000-8000-000000000401'::uuid,
  '30000000-0000-4000-8000-000000000002'::uuid,
  ('2099-11-01 08:00:00+10'::timestamptz + ((ordinal - 1) * interval '1 day')),
  120, 12000, 21000, 'posted'::public.job_status, crew_size
from (
  values
    ('51000000-0000-4000-8000-000000000501'::uuid, 1, 2),
    ('51000000-0000-4000-8000-000000000502'::uuid, 2, 1),
    ('51000000-0000-4000-8000-000000000503'::uuid, 3, 1),
    ('51000000-0000-4000-8000-000000000504'::uuid, 4, 1),
    ('51000000-0000-4000-8000-000000000505'::uuid, 5, 1),
    ('51000000-0000-4000-8000-000000000506'::uuid, 6, 1),
    ('51000000-0000-4000-8000-000000000507'::uuid, 7, 1),
    ('51000000-0000-4000-8000-000000000508'::uuid, 8, 2),
    ('51000000-0000-4000-8000-000000000509'::uuid, 9, 1)
) as fixture(job_id, ordinal, crew_size);

insert into public.offers (
  id, company_id, cleaner_id, job_id
) values (
  '51000000-0000-4000-8000-000000000901',
  '51000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000004',
  '51000000-0000-4000-8000-000000000509'
);
select is(
  (
    select status::text
    from public.offers
    where id = '51000000-0000-4000-8000-000000000901'
  ),
  'pending',
  'an offer inserted without a status behaves as pending'
);
delete from public.offers
where id = '51000000-0000-4000-8000-000000000901';

create temporary table cle_51_offer_ids (
  label text primary key,
  offer_id uuid not null
) on commit drop;
grant select, insert on table cle_51_offer_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.offer_job(
      '51000000-0000-4000-8000-000000000501',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '42501', 'Company admin access required',
  'a cleaner cannot create a directed offer'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_51_offer_ids
select 'accept', public.offer_job(
  '51000000-0000-4000-8000-000000000501',
  '10000000-0000-4000-8000-000000000002'
);
select throws_ok(
  $$select public.offer_job(
      '51000000-0000-4000-8000-000000000501',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '23514', 'Cleaner already has a pending offer for this job',
  'one cleaner cannot receive the same pending job offer twice'
);
reset role;

select results_eq(
  $$select status::text, resolved_at is null, company_id, cleaner_id, job_id,
           recurring_assignment_id is null
      from public.offers
     where id = (select offer_id from cle_51_offer_ids where label = 'accept')$$,
  $$values (
    'pending'::text, true,
    '51000000-0000-4000-8000-000000000010'::uuid,
    '10000000-0000-4000-8000-000000000002'::uuid,
    '51000000-0000-4000-8000-000000000501'::uuid,
    true
  )$$,
  'offer_job derives company and persists one pending job target'
);
select results_eq(
  $$select recipient_id, type::text
      from public.notifications
     where job_id = '51000000-0000-4000-8000-000000000501'
     order by recipient_id$$,
  $$values (
    '10000000-0000-4000-8000-000000000002'::uuid,
    'offer_received'::text
  )$$,
  'only the offered cleaner receives the offer notification'
);
select is(
  (select count(*)::integer from public.vacancies
    where job_id = '51000000-0000-4000-8000-000000000501'),
  1,
  'a pending job offer subtracts one place from the vacancy projection'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select cleaner_id, status::text
      from public.offers
     where job_id = '51000000-0000-4000-8000-000000000501'$$,
  $$values (
    '10000000-0000-4000-8000-000000000002'::uuid,
    'pending'::text
  )$$,
  'the company owner can read pending offers through offers_select_admin'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select cleaner_id, status::text
      from public.offers
     where job_id = '51000000-0000-4000-8000-000000000501'$$,
  $$values (
    '10000000-0000-4000-8000-000000000002'::uuid,
    'pending'::text
  )$$,
  'the company staff member can read pending offers through offers_select_admin'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select
      (select count(*)::integer from public.offers),
      (select count(*)::integer from public.cleaner_offers),
      (select count(*)::integer from public.cleaner_job_board
        where job_id = '51000000-0000-4000-8000-000000000501')$$,
  $$values (0, 0, 1)$$,
  'another cleaner sees neither the offer row nor offered place, only the unreserved slot'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select offer_id, status::text, target_kind, job_id, site_name, suburb,
           cleaner_pay_cents, crew_size
      from public.cleaner_offers$$,
  $$select offer_id, 'pending'::text, 'job'::text,
           '51000000-0000-4000-8000-000000000501'::uuid,
           'CLE-51 Site'::text, 'Robina'::text, 12000, 2
      from cle_51_offer_ids where label = 'accept'$$,
  'only the offered cleaner sees safe job context through cleaner_offers'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.assign_job_slot(
      '51000000-0000-4000-8000-000000000501', 1,
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '23514', 'Revoke the pending offer first',
  'an admin cannot assign the offered cleaner while their offer is pending'
);
select is(
  (select count(*)::integer from public.vacancies
    where job_id = '51000000-0000-4000-8000-000000000501'),
  1,
  'rejecting same-cleaner assignment preserves the genuinely open sibling vacancy'
);
select lives_ok(
  $$select public.assign_job_slot(
      '51000000-0000-4000-8000-000000000501', 1,
      '10000000-0000-4000-8000-000000000003'
    )$$,
  'an admin can fill the unreserved sibling slot'
);
select throws_ok(
  $$select public.assign_job_slot(
      '51000000-0000-4000-8000-000000000501', 2,
      '10000000-0000-4000-8000-000000000004'
    )$$,
  '23514', 'Revoke the pending offer first',
  'an admin cannot assign into capacity reserved by a pending offer'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.accept_offer(
      (select offer_id from cle_51_offer_ids where label = 'accept')
    )$$,
  'the offered cleaner accepts the reserved place'
);
select throws_ok(
  $$select public.decline_offer(
      (select offer_id from cle_51_offer_ids where label = 'accept')
    )$$,
  '23514', 'Offer is no longer pending',
  'an accepted offer cannot reach a second terminal state'
);
reset role;

select results_eq(
  $$select offer.status::text, offer.resolved_at is not null,
           assignment.slot_number, assignment.source::text, job.status::text
      from public.offers offer
      join public.job_assignments assignment
        on assignment.job_id = offer.job_id
       and assignment.cleaner_id = offer.cleaner_id
       and assignment.unassigned_at is null
      join public.jobs job on job.id = offer.job_id
     where offer.id = (select offer_id from cle_51_offer_ids where label = 'accept')$$,
  $$values ('accepted'::text, true, 2, 'manual'::text, 'assigned'::text)$$,
  'acceptance assigns the lowest open slot and closes a full job'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_51_offer_ids
select 'decline', public.offer_job(
  '51000000-0000-4000-8000-000000000502',
  '10000000-0000-4000-8000-000000000003'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.decline_offer(
      (select offer_id from cle_51_offer_ids where label = 'decline')
    )$$,
  '42501', 'Offered cleaner access required',
  'a different cleaner cannot answer the offer'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.decline_offer(
      (select offer_id from cle_51_offer_ids where label = 'decline')
    )$$,
  'the offered cleaner can decline once'
);
select is(
  (select count(*)::integer from public.cleaner_job_board
    where job_id = '51000000-0000-4000-8000-000000000502'),
  1,
  'declining returns the place to the cleaner board immediately'
);
reset role;

select results_eq(
  $$select offer.status::text, offer.resolved_at is not null,
           (select count(*)::integer from public.vacancies
             where job_id = offer.job_id)
      from public.offers offer
     where offer.id = (select offer_id from cle_51_offer_ids where label = 'decline')$$,
  $$values ('declined'::text, true, 1)$$,
  'decline resolves the offer and restores the vacancy projection'
);
select results_eq(
  $$select recipient_id
      from public.notifications
     where job_id = '51000000-0000-4000-8000-000000000502'
       and type = 'offer_declined'
     order by recipient_id$$,
  $$values
    ('10000000-0000-4000-8000-000000000001'::uuid),
    ('10000000-0000-4000-8000-000000000006'::uuid)$$,
  'decline records one notification for every active company admin'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.offer_job(
      '51000000-0000-4000-8000-000000000502',
      '10000000-0000-4000-8000-000000000003'
    )$$,
  'a declined job-cleaner pair can receive a fresh pending offer'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.offers
    where job_id = '51000000-0000-4000-8000-000000000502'
      and cleaner_id = '10000000-0000-4000-8000-000000000003'
      and status = 'pending'
  ),
  1,
  'the pending-only unique index permits exactly one re-offer after decline'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_51_offer_ids
select 'revoke', public.offer_job(
  '51000000-0000-4000-8000-000000000503',
  '10000000-0000-4000-8000-000000000004'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.revoke_offer(
      (select offer_id from cle_51_offer_ids where label = 'revoke')
    )$$,
  '42501', 'Company admin access required',
  'a foreign company owner cannot revoke an offer'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.revoke_offer(
      (select offer_id from cle_51_offer_ids where label = 'revoke')
    )$$,
  'an own-company admin can revoke a pending offer'
);
reset role;
select results_eq(
  $$select status::text, resolved_at is not null
      from public.offers
     where id = (select offer_id from cle_51_offer_ids where label = 'revoke')$$,
  $$values ('revoked'::text, true)$$,
  'revoke records the terminal state'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_51_offer_ids
select 'cancel', public.offer_job(
  '51000000-0000-4000-8000-000000000504',
  '10000000-0000-4000-8000-000000000002'
);
select lives_ok(
  $$select public.cancel_job('51000000-0000-4000-8000-000000000504')$$,
  'cancelling a job with a waiting offer succeeds'
);
reset role;
select results_eq(
  $$select status::text, resolved_at is not null
      from public.offers
     where id = (select offer_id from cle_51_offer_ids where label = 'cancel')$$,
  $$values ('revoked'::text, true)$$,
  'job cancellation revokes every pending job offer'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_51_offer_ids
select 'membership', public.offer_job(
  '51000000-0000-4000-8000-000000000505',
  '10000000-0000-4000-8000-000000000003'
);
reset role;
update public.company_members
set status = 'removed'
where company_id = '51000000-0000-4000-8000-000000000010'
  and profile_id = '10000000-0000-4000-8000-000000000003';
select results_eq(
  $$select status::text, resolved_at is not null
      from public.offers
     where id = (select offer_id from cle_51_offer_ids where label = 'membership')$$,
  $$values ('revoked'::text, true)$$,
  'losing cleaner membership revokes that cleaner pending offers in the company'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into cle_51_offer_ids
select 'unavailable', public.offer_job(
  '51000000-0000-4000-8000-000000000506',
  '10000000-0000-4000-8000-000000000004'
);
reset role;
insert into public.job_assignments (job_id, slot_number, cleaner_id)
values (
  '51000000-0000-4000-8000-000000000506', 1,
  '10000000-0000-4000-8000-000000000002'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.accept_offer(
      (select offer_id from cle_51_offer_ids where label = 'unavailable')
    )$$,
  '23514', 'No open slot is available',
  'defensive acceptance rejects an unexpectedly unavailable job'
);
reset role;
select results_eq(
  $$select status::text, resolved_at is null
      from public.offers
     where id = (select offer_id from cle_51_offer_ids where label = 'unavailable')$$,
  $$values ('pending'::text, true)$$,
  'an unavailable acceptance rolls back and leaves the offer pending'
);

insert into public.job_applications (job_id, cleaner_id)
values (
  '51000000-0000-4000-8000-000000000507',
  '10000000-0000-4000-8000-000000000002'
);
insert into public.job_assignments (job_id, slot_number, cleaner_id)
values (
  '51000000-0000-4000-8000-000000000508', 1,
  '10000000-0000-4000-8000-000000000002'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.offer_job(
      '51000000-0000-4000-8000-000000000507',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '23514', 'Cleaner has already applied to this job',
  'an applicant cannot also receive a directed offer'
);
select throws_ok(
  $$select public.offer_job(
      '51000000-0000-4000-8000-000000000508',
      '10000000-0000-4000-8000-000000000002'
    )$$,
  '23514', 'Cleaner is already assigned to this job',
  'an assigned cleaner cannot also receive a directed offer'
);
select throws_ok(
  $$select public.offer_job(
      '51000000-0000-4000-8000-000000000509',
      '10000000-0000-4000-8000-000000000005'
    )$$,
  '23514', 'Cleaner is not an active pool member',
  'a removed cleaner cannot receive an offer'
);
reset role;

select * from finish();
rollback;
