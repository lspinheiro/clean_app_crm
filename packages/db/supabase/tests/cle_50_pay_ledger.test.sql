begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Public contract: append-only source records, narrow views, and an RPC-only settlement.
select has_table('public', 'ledger_entries', 'pay ledger entries exist');
select results_eq(
  $$select enumlabel::text collate "C"
    from pg_enum
    where enumtypid = 'public.ledger_status'::regtype
    order by enumsortorder$$,
  $$values
    ('owed'::text collate "C"),
    ('paid'::text collate "C")$$,
  'ledger status is the one-way owed-to-paid lifecycle'
);
select results_eq(
  $$select enumlabel::text collate "C"
    from pg_enum
    where enumtypid = 'public.notification_type'::regtype
    order by enumsortorder$$,
  $$values
    ('job_assigned'::text collate "C"),
    ('job_posted'::text collate "C"),
    ('job_cancelled'::text collate "C"),
    ('payment_marked_paid'::text collate "C")$$,
  'notification records include settlement without replacing job events'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ledger_entries'::regclass),
  'the raw ledger has RLS enabled'
);
select results_eq(
  $$select string_agg(column_name::text, ',' order by ordinal_position) collate "C"
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_ledger_entries'$$,
  $$values (
    'ledger_entry_id,company_id,cleaner_id,cleaner_name,job_id,site_id,site_name,scheduled_start,amount_cents,status,created_at,paid_at,payment_note'::text collate "C"
  )$$,
  'the company ledger view exposes the reviewed operational projection'
);
select results_eq(
  $$select string_agg(column_name::text, ',' order by ordinal_position) collate "C"
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cleaner_ledger_entries'$$,
  $$values (
    'ledger_entry_id,company_id,company_name,company_logo_path,amount_cents,status,created_at,paid_at'::text collate "C"
  )$$,
  'the cleaner ledger view contains no client, site, charge, or payment-note fields'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.ledger_entries',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'authenticated callers have no raw ledger access'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.ledger_entries',
    'SELECT'
  )
    and has_table_privilege(
      'service_role',
      'public.ledger_entries',
      'INSERT'
    )
    and not has_table_privilege(
      'service_role',
      'public.ledger_entries',
      'UPDATE'
    )
    and not has_table_privilege(
      'service_role',
      'public.ledger_entries',
      'DELETE'
    ),
  'service role can append and inspect ledger history but cannot rewrite or delete it'
);
select ok(
  has_table_privilege('authenticated', 'public.company_ledger_entries', 'SELECT')
    and has_table_privilege('authenticated', 'public.cleaner_ledger_entries', 'SELECT')
    and has_table_privilege('service_role', 'public.company_ledger_entries', 'SELECT')
    and has_table_privilege('service_role', 'public.cleaner_ledger_entries', 'SELECT'),
  'both narrow ledger views have explicit authenticated and service-role grants'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.mark_ledger_paid(uuid,text)',
    'EXECUTE'
  )
    and has_function_privilege(
      'service_role',
      'public.mark_ledger_paid(uuid,text)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.mark_ledger_paid(uuid,text)',
      'EXECUTE'
    ),
  'settlement is available only through the narrow authenticated RPC boundary'
);
select is(
  pg_get_function_result('public.mark_ledger_paid(uuid,text)'::regprocedure),
  'void',
  'mark paid returns no client-controlled record'
);

-- A real foreign company admin proves tenant isolation, not merely missing identity.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  (
    '50000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle50-foreign-admin@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"CLE-50 Foreign Admin"}', now(), now(), '', '', '', ''
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle50-foreign-cleaner@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"CLE-50 Foreign Cleaner"}', now(), now(), '', '', '', ''
  );
update public.profiles
set role = 'company_admin'
where id = '50000000-0000-4000-8000-000000000001';
insert into public.companies (id, name, abn, status)
values (
  '50000000-0000-4000-8000-000000000010',
  'CLE-50 Foreign Company',
  '50999999999',
  'approved'
);
insert into public.company_members (company_id, profile_id)
values
  (
    '50000000-0000-4000-8000-000000000010',
    '50000000-0000-4000-8000-000000000001'
  ),
  (
    '50000000-0000-4000-8000-000000000010',
    '50000000-0000-4000-8000-000000000002'
  );
insert into public.clients (id, company_id, name, phone)
values (
  '50000000-0000-4000-8000-000000000301',
  '50000000-0000-4000-8000-000000000010',
  'CLE-50 Foreign Client',
  '07 5555 5000'
);
insert into public.sites (id, client_id, name, address, suburb)
values (
  '50000000-0000-4000-8000-000000000401',
  '50000000-0000-4000-8000-000000000301',
  'CLE-50 Foreign Site',
  '50 Foreign Street',
  'Coolangatta'
);

insert into public.jobs (
  id, site_id, service_id, scheduled_start, duration_minutes,
  cleaner_pay_cents, client_charge_cents, status, crew_size
) values
  (
    '50000000-0000-4000-8000-000000000501',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-10-01T08:00:00+10', 120, 12000, 21000, 'assigned', 2
  ),
  (
    '50000000-0000-4000-8000-000000000502',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-10-01T12:00:00+10', 60, 9000, 15000, 'assigned', 1
  ),
  (
    '50000000-0000-4000-8000-000000000503',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-10-01T15:00:00+10', 60, 8000, 14000, 'posted', 1
  );
insert into public.job_assignments (job_id, slot_number, cleaner_id)
values
  (
    '50000000-0000-4000-8000-000000000501',
    1,
    '10000000-0000-4000-8000-000000000002'
  ),
  (
    '50000000-0000-4000-8000-000000000501',
    2,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    '50000000-0000-4000-8000-000000000502',
    1,
    '10000000-0000-4000-8000-000000000002'
  );
insert into public.job_assignments (
  job_id,
  slot_number,
  cleaner_id,
  assigned_at,
  unassigned_at
) values (
  '50000000-0000-4000-8000-000000000501',
  1,
  '10000000-0000-4000-8000-000000000004',
  '2099-09-30T08:00:00+10',
  '2099-09-30T09:00:00+10'
);

select is(
  (
    select count(*)::integer
    from public.ledger_entries
    where job_id in (
      '50000000-0000-4000-8000-000000000501',
      '50000000-0000-4000-8000-000000000502',
      '50000000-0000-4000-8000-000000000503'
    )
  ),
  0,
  'assigned, posted, and other never-completed jobs create no ledger entries'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.update_job_status(
      '50000000-0000-4000-8000-000000000501',
      'on_the_way'
    )$$,
  'an assigned cleaner advances the crew job on the way'
);
select lives_ok(
  $$select public.update_job_status(
      '50000000-0000-4000-8000-000000000501',
      'in_progress'
    )$$,
  'the assigned cleaner starts the crew job'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.ledger_entries
    where job_id = '50000000-0000-4000-8000-000000000501'
  ),
  0,
  'in-progress work is not yet recorded as money owed'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.update_job_status(
      '50000000-0000-4000-8000-000000000501',
      'completed'
    )$$,
  'completion writes the crew pay ledger atomically'
);
select throws_ok(
  $$select public.update_job_status(
      '50000000-0000-4000-8000-000000000501',
      'completed'
    )$$,
  '23514',
  'Invalid job status transition',
  'the public status RPC rejects a second completion'
);
reset role;

select results_eq(
  $$select cleaner_id, amount_cents, status::text
    from public.ledger_entries
    where job_id = '50000000-0000-4000-8000-000000000501'
    order by cleaner_id$$,
  $$values
    (
      '10000000-0000-4000-8000-000000000002'::uuid,
      12000,
      'owed'::text
    ),
    (
      '10000000-0000-4000-8000-000000000003'::uuid,
      12000,
      'owed'::text
    )$$,
  'crew-two completion creates one owed entry per active cleaner at job-record pay'
);
update public.jobs
set status = 'in_progress'
where id = '50000000-0000-4000-8000-000000000501';
update public.jobs
set status = 'completed'
where id = '50000000-0000-4000-8000-000000000501';
select is(
  (
    select count(*)::integer
    from public.ledger_entries
    where job_id = '50000000-0000-4000-8000-000000000501'
  ),
  2,
  'a replayed completion transition cannot duplicate ledger entries'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.cancel_job('50000000-0000-4000-8000-000000000502')$$,
  'the company can cancel the separate assigned fixture'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.ledger_entries
    where job_id in (
      '50000000-0000-4000-8000-000000000502',
      '50000000-0000-4000-8000-000000000503'
    )
  ),
  0,
  'cancelled and posted jobs never create ledger entries'
);

select set_config(
  'test.cle50_ledger_entry',
  (
    select id::text
    from public.ledger_entries
    where job_id = '50000000-0000-4000-8000-000000000501'
      and cleaner_id = '10000000-0000-4000-8000-000000000002'
  ),
  true
);
select set_config(
  'test.cle50_other_ledger_entry',
  (
    select id::text
    from public.ledger_entries
    where job_id = '50000000-0000-4000-8000-000000000501'
      and cleaner_id = '10000000-0000-4000-8000-000000000003'
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  format(
    'select public.mark_ledger_paid(%L::uuid, null)',
    current_setting('test.cle50_ledger_entry')
  ),
  '42501',
  'Company admin access required',
  'a cleaner cannot mark a ledger entry paid'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  format(
    'select public.mark_ledger_paid(%L::uuid, null)',
    current_setting('test.cle50_ledger_entry')
  ),
  '42501',
  'Company admin access required',
  'a foreign company admin cannot settle another company entry'
);
reset role;
select results_eq(
  $$select status::text, paid_at, payment_note
    from public.ledger_entries
    where id = current_setting('test.cle50_ledger_entry')::uuid$$,
  $$values ('owed'::text, null::timestamptz, null::text)$$,
  'denied settlement attempts create no state change'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  format(
    'select public.mark_ledger_paid(%L::uuid, %L)',
    current_setting('test.cle50_ledger_entry'),
    '  bank transfer  '
  ),
  'the owning company admin marks the entry paid'
);
select throws_ok(
  format(
    'select public.mark_ledger_paid(%L::uuid, null)',
    current_setting('test.cle50_ledger_entry')
  ),
  '23514',
  'Ledger entry is already paid',
  'paid is a one-way RPC transition'
);
reset role;

select results_eq(
  $$select entry.status::text, entry.paid_at is not null, entry.payment_note,
           notification.recipient_id, notification.job_id, notification.type::text,
           notification.ledger_entry_id
    from public.ledger_entries entry
    join public.notifications notification
      on notification.ledger_entry_id = entry.id
    where entry.id = current_setting('test.cle50_ledger_entry')::uuid$$,
  $$values (
    'paid'::text,
    true,
    'bank transfer'::text,
    '10000000-0000-4000-8000-000000000002'::uuid,
    '50000000-0000-4000-8000-000000000501'::uuid,
    'payment_marked_paid'::text,
    current_setting('test.cle50_ledger_entry')::uuid
  )$$,
  'settlement records paid time, trimmed note, and one cleaner notification atomically'
);
select is(
  (
    select count(*)::integer
    from public.notifications
    where ledger_entry_id = current_setting('test.cle50_ledger_entry')::uuid
  ),
  1,
  'repeated settlement cannot duplicate its notification'
);

insert into public.notifications (
  recipient_id,
  job_id,
  type,
  ledger_entry_id
) values (
  '10000000-0000-4000-8000-000000000003',
  '50000000-0000-4000-8000-000000000501',
  'payment_marked_paid',
  current_setting('test.cle50_other_ledger_entry')::uuid
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  format(
    'select public.mark_ledger_paid(%L::uuid, null)',
    current_setting('test.cle50_other_ledger_entry')
  ),
  '23505',
  null,
  'a failed settlement notification aborts the ledger state change'
);
reset role;
select results_eq(
  $$select status::text, paid_at, payment_note
    from public.ledger_entries
    where id = current_setting('test.cle50_other_ledger_entry')::uuid$$,
  $$values ('owed'::text, null::timestamptz, null::text)$$,
  'notification failure leaves the entry owed with no settlement details'
);
delete from public.notifications
where ledger_entry_id = current_setting('test.cle50_other_ledger_entry')::uuid;

select throws_ok(
  format(
    'update public.ledger_entries set status = %L, paid_at = null where id = %L::uuid',
    'owed',
    current_setting('test.cle50_ledger_entry')
  ),
  '23514',
  'Paid ledger entries cannot return to owed',
  'the table invariant also rejects reversing paid state'
);
select throws_ok(
  format(
    'update public.ledger_entries set amount_cents = amount_cents + 1 where id = %L::uuid',
    current_setting('test.cle50_ledger_entry')
  ),
  '23514',
  'Ledger entry amount cannot change',
  'the agreed amount is immutable once completion records it'
);
select throws_ok(
  format(
    'update public.ledger_entries set paid_at = paid_at + interval %L, payment_note = %L where id = %L::uuid',
    '1 minute',
    'rewritten',
    current_setting('test.cle50_ledger_entry')
  ),
  '23514',
  'Paid ledger entry settlement cannot change',
  'paid timestamp and settlement note become immutable history'
);

-- A malformed trusted fixture proves the company view does not trust ledger.company_id alone.
insert into public.ledger_entries (
  id,
  company_id,
  cleaner_id,
  job_id,
  amount_cents
) values (
  '50000000-0000-4000-8000-000000000601',
  '50000000-0000-4000-8000-000000000010',
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000503',
  7000
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.mark_ledger_paid(
      '50000000-0000-4000-8000-000000000601',
      null
    )$$,
  '42501',
  'Company admin access required',
  'settlement rejects a ledger row whose company disagrees with its job'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.mark_ledger_paid(
      '50000000-0000-4000-8000-000000000601',
      null
    )$$,
  '42501',
  'Company admin access required',
  'the job company admin also cannot settle a mismatched ledger row'
);
reset role;
select results_eq(
  $$select status::text, paid_at, payment_note,
           (select count(*)::integer
            from public.notifications notification
            where notification.ledger_entry_id = ledger.id)
    from public.ledger_entries ledger
    where id = '50000000-0000-4000-8000-000000000601'$$,
  $$values ('owed'::text, null::timestamptz, null::text, 0)$$,
  'a rejected malformed settlement has no ledger or notification side effect'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select cleaner_id, cleaner_name, amount_cents, status::text
    from public.company_ledger_entries
    where job_id = '50000000-0000-4000-8000-000000000501'
    order by cleaner_id$$,
  $$values
    (
      '10000000-0000-4000-8000-000000000002'::uuid,
      'Demo Cleaner One'::text,
      12000,
      'paid'::text
    ),
    (
      '10000000-0000-4000-8000-000000000003'::uuid,
      'Demo Cleaner Two'::text,
      12000,
      'owed'::text
    )$$,
  'the owning admin sees one accurate row per crew slot with cleaner names'
);
select is(
  (
    select count(*)::integer
    from public.company_ledger_entries
    where company_id = '50000000-0000-4000-8000-000000000010'
  ),
  0,
  'the owning admin cannot see a cross-company malformed ledger join'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.company_ledger_entries),
  0,
  'a foreign admin sees neither valid entries nor a mismatched trusted fixture'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.company_ledger_entries),
  0,
  'an active cleaner cannot read the company ledger view'
);
reset role;

update public.company_members
set status = 'removed'
where company_id = '10000000-0000-4000-8000-000000000010'
  and profile_id in (
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003'
  );
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select company_name, amount_cents, status::text, paid_at is not null
    from public.cleaner_ledger_entries
    where ledger_entry_id in (
      current_setting('test.cle50_ledger_entry')::uuid,
      current_setting('test.cle50_other_ledger_entry')::uuid
    )$$,
  $$values ('Coastal Demo Cleaning'::text, 12000, 'paid'::text, true)$$,
  'a removed cleaner retains only her own paid history'
);
select is(
  (
    select count(*)::integer
    from public.notifications
    where type = 'payment_marked_paid'
      and recipient_id = auth.uid()
      and ledger_entry_id = current_setting('test.cle50_ledger_entry')::uuid
  ),
  1,
  'the cleaner can read her own settlement notification through existing RLS'
);
select throws_ok(
  format(
    'insert into public.notifications (recipient_id, job_id, type) values (%L, %L, %L)',
    '10000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000501',
    'payment_marked_paid'
  ),
  '42501',
  null,
  'authenticated callers cannot fabricate settlement notifications'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select company_name, amount_cents, status::text, paid_at is not null
    from public.cleaner_ledger_entries
    where ledger_entry_id = current_setting('test.cle50_other_ledger_entry')::uuid$$,
  $$values ('Coastal Demo Cleaning'::text, 12000, 'owed'::text, false)$$,
  'a removed cleaner retains only her own owed history'
);
reset role;

select throws_ok(
  $$insert into public.notifications (recipient_id, job_id, type)
    values (
      '10000000-0000-4000-8000-000000000003',
      '50000000-0000-4000-8000-000000000501',
      'payment_marked_paid'
    )$$,
  '23514',
  null,
  'a settlement notification must identify its ledger entry'
);
select throws_ok(
  format(
    'insert into public.notifications (recipient_id, job_id, type, ledger_entry_id) values (%L, %L, %L, %L::uuid)',
    '10000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000501',
    'job_assigned',
    current_setting('test.cle50_ledger_entry')
  ),
  '23514',
  null,
  'job notifications cannot carry a settlement ledger entry'
);

select * from finish();
rollback;
