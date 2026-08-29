-- CLE-88 acceptance: the cleaner news read model.
--
-- Cleaners read their own notifications through public.cleaner_notifications, a
-- security-barrier view that reads with its owner's rights, narrows to the calling
-- recipient, and admits only the cleaner-facing notification kinds. The street address
-- and the access notes stay behind get_cleaner_job_access(), which audits every
-- disclosure, so neither may ever reach this projection.
begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- The read model exists and projects only cleaner-safe columns
-- ---------------------------------------------------------------------------

select has_view(
  'public',
  'cleaner_notifications',
  'cleaners read their news through one dedicated view'
);

select columns_are(
  'public',
  'cleaner_notifications',
  array[
    'notification_id',
    'job_id',
    'type',
    'read_at',
    'created_at',
    'company_name',
    'site_name',
    'suburb',
    'service_name',
    'service_slug',
    'scheduled_start'
  ],
  'the news projection carries identity, kind, read state, and only the job details a cleaner may see'
);

select hasnt_column(
  'public',
  'cleaner_notifications',
  'address',
  'the news projection never carries the site street address'
);

select hasnt_column(
  'public',
  'cleaner_notifications',
  'access_notes',
  'the news projection never carries the site access notes'
);

select results_eq(
  $$select setting.value::text collate "C"
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.unnest(
        coalesce(relation.reloptions, array[]::text[])
      ) as setting(value)
     where relation.relnamespace = 'public'::regnamespace
       and relation.relname = 'cleaner_notifications'
     order by setting.value::text collate "C"$$,
  $$values
    ('security_barrier=true'::text collate "C"),
    ('security_invoker=false'::text collate "C")$$,
  'the news view is a security barrier that reads with its owner''s rights'
);

-- ---------------------------------------------------------------------------
-- Grants: signed-in cleaners read, nobody writes, anonymous callers get nothing
-- ---------------------------------------------------------------------------

select table_privs_are(
  'public',
  'cleaner_notifications',
  'authenticated',
  array['SELECT'],
  'authenticated cleaners receive read access to their news and no write path'
);

select ok(
  coalesce(
    has_table_privilege(
      'service_role',
      pg_catalog.to_regclass('public.cleaner_notifications'),
      'SELECT'
    ),
    false
  ),
  'service role has an explicit news-view grant'
);

select table_privs_are(
  'public',
  'cleaner_notifications',
  'anon',
  array[]::name[],
  'anonymous callers hold no privilege at all on the news view'
);

-- ---------------------------------------------------------------------------
-- Fixtures: one company, one site carrying both private fields, and four jobs
-- that between them produce every cleaner-facing notification kind
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, abn, status)
values (
  '88000000-0000-4000-8000-000000000010',
  'CLE-88 News Company',
  '88000000001',
  'approved'
);

insert into public.clients (id, company_id, name)
values (
  '88000000-0000-4000-8000-000000000110',
  '88000000-0000-4000-8000-000000000010',
  'CLE-88 Client'
);

insert into public.sites (id, client_id, name, address, suburb, access_notes)
values (
  '88000000-0000-4000-8000-000000000401',
  '88000000-0000-4000-8000-000000000110',
  'CLE-88 Riverside Plaza',
  '88 Marine Parade',
  'Surfers Paradise',
  'Key safe left of the loading dock'
);

insert into public.company_members (id, company_id, profile_id, status)
values
  (
    '88000000-0000-4000-8000-000000000081',
    '88000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000002',
    'active'
  ),
  (
    '88000000-0000-4000-8000-000000000082',
    '88000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000003',
    'active'
  );

insert into public.employee_memberships (id, company_id, profile_id, role, status)
values (
  '88000000-0000-4000-8000-000000000091',
  '88000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  'owner',
  'active'
);

insert into public.jobs (
  id, site_id, service_id, scheduled_start, duration_minutes,
  cleaner_pay_cents, client_charge_cents, status, crew_size
) values
  (
    '88000000-0000-4000-8000-000000000501',
    '88000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-11-02T08:00:00+10', 120, 12000, 21000, 'draft', 2
  ),
  (
    '88000000-0000-4000-8000-000000000502',
    '88000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-11-03T08:00:00+10', 120, 12000, 21000, 'draft', 1
  ),
  (
    '88000000-0000-4000-8000-000000000503',
    '88000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-11-04T08:00:00+10', 120, 12000, 21000, 'draft', 1
  ),
  (
    '88000000-0000-4000-8000-000000000504',
    '88000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2025-07-07T08:00:00+10', 120, 12000, 21000, 'in_progress', 1
  );

-- The settled job takes the ordinary completion path, so its pay ledger entry is
-- written by the delivered trigger rather than by hand.
insert into public.job_assignments (job_id, slot_number, cleaner_id)
values (
  '88000000-0000-4000-8000-000000000504',
  1,
  '10000000-0000-4000-8000-000000000002'
);

update public.jobs
set status = 'completed'
where id = '88000000-0000-4000-8000-000000000504';

select ok(
  (
    select site.address is not null and site.access_notes is not null
    from public.sites site
    where site.id = '88000000-0000-4000-8000-000000000401'
  ),
  'the fixture site carries the street address and access notes the news view must withhold'
);

-- Every cleaner-side read goes through this helper. An unqualified select on a view
-- that does not exist yet aborts the whole transaction, and the remaining tests would
-- then report nothing at all instead of failing for the behaviour that is missing.
create function pg_temp.cleaner_news()
returns table (
  notification_id uuid,
  job_id uuid,
  type public.notification_type,
  read_at timestamptz,
  created_at timestamptz,
  company_name text,
  site_name text,
  suburb text,
  service_name text,
  service_slug text,
  scheduled_start timestamptz
)
language plpgsql
set search_path = ''
as $$
begin
  return query execute
    'select notification_id, job_id, type, read_at, created_at,
            company_name::text, site_name::text, suburb::text,
            service_name::text, service_slug::text, scheduled_start
       from public.cleaner_notifications';
exception
  when undefined_table or undefined_column or insufficient_privilege then
    return;
end;
$$;

-- ---------------------------------------------------------------------------
-- The delivered loop writes every cleaner-facing notification kind
-- ---------------------------------------------------------------------------

-- The completion trigger has already written the pay entry. Resolve its id here, as the
-- fixture writer: `ledger_entries` is revoked from `authenticated`
-- (20260812101000_cle_50_pay_ledger_foundations.sql), so naming the row from inside the
-- role block below would fail on the grant instead of on this slice's behaviour.
select set_config(
  'test.cle88_ledger_entry',
  (
    select entry.id::text
    from public.ledger_entries entry
    where entry.job_id = '88000000-0000-4000-8000-000000000504'
      and entry.cleaner_id = '10000000-0000-4000-8000-000000000002'
      and entry.status = 'owed'
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.post_job('88000000-0000-4000-8000-000000000501')$$,
  'posting the crew-two job gives both cleaners posting news'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_job('88000000-0000-4000-8000-000000000501')$$,
  'the second cleaner applies, which gives the company owner application news'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.post_job('88000000-0000-4000-8000-000000000502')$$,
  'the single-slot job is posted to both cleaners'
);
select lives_ok(
  $$select public.assign_job_slot(
      '88000000-0000-4000-8000-000000000502',
      1,
      '10000000-0000-4000-8000-000000000002'
    )$$,
  'filling the only slot assigns the first cleaner and fully crews the job'
);
select lives_ok(
  $$select public.post_job('88000000-0000-4000-8000-000000000503')$$,
  'the job that will be cancelled is posted to both cleaners'
);
select lives_ok(
  $$select public.assign_job_slot(
      '88000000-0000-4000-8000-000000000503',
      1,
      '10000000-0000-4000-8000-000000000002'
    )$$,
  'the first cleaner is assigned before the cancellation'
);
select lives_ok(
  $$select public.cancel_job('88000000-0000-4000-8000-000000000503')$$,
  'cancelling the job releases the cleaner and gives her cancellation news'
);
select lives_ok(
  format(
    'select public.mark_ledger_paid(%L::uuid, %L)',
    current_setting('test.cle88_ledger_entry'),
    'bank transfer'
  ),
  'settling the completed job gives the first cleaner payment news'
);
reset role;

-- An admin-facing kind addressed to a cleaner is the sharpest test of the kind
-- filter: narrowing by recipient alone would let this record through.
insert into public.notifications (recipient_id, job_id, type)
values (
  '10000000-0000-4000-8000-000000000002',
  '88000000-0000-4000-8000-000000000501',
  'application_received'
);

select results_eq(
  $$select notification.recipient_id, count(*)::integer
      from public.notifications notification
     where notification.job_id in (
       '88000000-0000-4000-8000-000000000501',
       '88000000-0000-4000-8000-000000000502',
       '88000000-0000-4000-8000-000000000503',
       '88000000-0000-4000-8000-000000000504'
     )
     group by notification.recipient_id
     order by notification.recipient_id$$,
  $$values
    ('10000000-0000-4000-8000-000000000001'::uuid, 1),
    ('10000000-0000-4000-8000-000000000002'::uuid, 8),
    ('10000000-0000-4000-8000-000000000003'::uuid, 3)$$,
  'the fixture flow leaves durable news for the owner and for both cleaners'
);

select results_eq(
  $$select job.id, job.status::text
      from public.jobs job
     where job.id in (
       '88000000-0000-4000-8000-000000000502',
       '88000000-0000-4000-8000-000000000503'
     )
     order by job.id$$,
  $$values
    ('88000000-0000-4000-8000-000000000502'::uuid, 'assigned'::text),
    ('88000000-0000-4000-8000-000000000503'::uuid, 'cancelled'::text)$$,
  'the second job is now fully crewed and the third is cancelled'
);

-- Read state is load-bearing: it drives the unread badge. Leave one record read so a
-- projection that hardcodes `null as read_at` cannot pass.
update public.notifications
set read_at = '2026-08-26T09:00:00+10'::timestamptz
where recipient_id = '10000000-0000-4000-8000-000000000002'
  and job_id = '88000000-0000-4000-8000-000000000503'
  and type = 'job_cancelled';

-- Her real notification ids, in id order. The view must project these, not a synthesised
-- key: the cleaner app marks news read by this id through the column-scoped update grant
-- on public.notifications, so a wrong id ships a broken badge behind a green suite.
select set_config(
  'test.cle88_her_news_ids',
  (
    select string_agg(notification.id::text, ',' order by notification.id)
    from public.notifications notification
    where notification.recipient_id = '10000000-0000-4000-8000-000000000002'
      and notification.job_id in (
        '88000000-0000-4000-8000-000000000501',
        '88000000-0000-4000-8000-000000000502',
        '88000000-0000-4000-8000-000000000503',
        '88000000-0000-4000-8000-000000000504'
      )
      and notification.type <> 'application_received'
  ),
  true
);

-- ---------------------------------------------------------------------------
-- A cleaner reads her own news, and only her own
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select
      news.type::text,
      news.company_name::text,
      news.site_name::text,
      news.suburb::text,
      news.service_name::text,
      news.service_slug::text,
      news.scheduled_start,
      news.read_at
    from pg_temp.cleaner_news() news
   where news.job_id in (
     '88000000-0000-4000-8000-000000000501',
     '88000000-0000-4000-8000-000000000502',
     '88000000-0000-4000-8000-000000000503',
     '88000000-0000-4000-8000-000000000504'
   )
   order by news.scheduled_start, news.type::text collate "C"$$,
  $$values
    ('payment_marked_paid'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2025-07-07T08:00:00+10'::timestamptz, null::timestamptz),
    ('job_posted'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2099-11-02T08:00:00+10'::timestamptz, null::timestamptz),
    ('job_assigned'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2099-11-03T08:00:00+10'::timestamptz, null::timestamptz),
    ('job_posted'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2099-11-03T08:00:00+10'::timestamptz, null::timestamptz),
    ('job_assigned'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2099-11-04T08:00:00+10'::timestamptz, null::timestamptz),
    ('job_cancelled'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2099-11-04T08:00:00+10'::timestamptz, '2026-08-26T09:00:00+10'::timestamptz),
    ('job_posted'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2099-11-04T08:00:00+10'::timestamptz, null::timestamptz)$$,
  'a cleaner reads her own news with the company, site, suburb, service, and start of each job'
);

-- Set equality, not an absence count: it pins the recipient filter, the kind filter, and
-- column identity in one assertion, and it cannot pass vacuously against a missing view.
select is(
  (
    select string_agg(news.notification_id::text, ',' order by news.notification_id)
    from pg_temp.cleaner_news() news
    where news.job_id in (
      '88000000-0000-4000-8000-000000000501',
      '88000000-0000-4000-8000-000000000502',
      '88000000-0000-4000-8000-000000000503',
      '88000000-0000-4000-8000-000000000504'
    )
  ),
  current_setting('test.cle88_her_news_ids'),
  'she reads exactly her own seven notification records, by their real ids'
);

select is(
  (
    select count(*)::integer
    from pg_temp.cleaner_news() news
    where news.job_id = '88000000-0000-4000-8000-000000000501'
  ),
  1,
  'the posting that reached both cleaners shows her one row, not two'
);

select is(
  (
    select count(*)::integer
    from pg_temp.cleaner_news() news
    where news.type::text = 'application_received'
  ),
  0,
  'an admin-facing application notice addressed to a cleaner is still withheld'
);

select results_eq(
  $$select
      news.type::text,
      news.company_name::text,
      news.site_name::text,
      news.suburb::text,
      news.service_name::text,
      news.service_slug::text,
      news.scheduled_start
    from pg_temp.cleaner_news() news
   where news.job_id in (
     '88000000-0000-4000-8000-000000000502',
     '88000000-0000-4000-8000-000000000503'
   )
   order by news.scheduled_start, news.type::text collate "C"$$,
  $$values
    ('job_assigned'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2099-11-03T08:00:00+10'::timestamptz),
    ('job_posted'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2099-11-03T08:00:00+10'::timestamptz),
    ('job_assigned'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2099-11-04T08:00:00+10'::timestamptz),
    ('job_cancelled'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2099-11-04T08:00:00+10'::timestamptz),
    ('job_posted'::text, 'CLE-88 News Company'::text,
     'CLE-88 Riverside Plaza'::text, 'Surfers Paradise'::text,
     'Standard clean'::text, 'standard-clean'::text,
     '2099-11-04T08:00:00+10'::timestamptz)$$,
  'a fully crewed job and a cancelled job keep every news detail intact'
);
reset role;

-- ---------------------------------------------------------------------------
-- Company admins keep their own news out of the cleaner view
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from pg_temp.cleaner_news() news
    where news.job_id in (
      '88000000-0000-4000-8000-000000000501',
      '88000000-0000-4000-8000-000000000502',
      '88000000-0000-4000-8000-000000000503',
      '88000000-0000-4000-8000-000000000504'
    )
  ),
  0,
  'the company owner''s application news never appears in the cleaner view'
);
reset role;

-- ---------------------------------------------------------------------------
-- Signed-out readers get nothing
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select * from public.cleaner_notifications$$,
  '42501',
  null,
  'a signed-out reader is refused at the grant boundary'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from pg_temp.cleaner_news()),
  0,
  'a session carrying no subject claim reads no news at all'
);
reset role;

select * from finish();
rollback;
