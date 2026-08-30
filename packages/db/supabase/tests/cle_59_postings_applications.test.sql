begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'postings', 'postings have a canonical table');
select has_table('public', 'join_requests', 'join requests have a canonical table');
select has_function(
  'public',
  'create_posting',
  array['uuid', 'posting_intent', 'text', 'uuid', 'uuid', 'timestamp with time zone', 'integer'],
  'posting creation is one narrow flow RPC'
);
select has_function(
  'public',
  'apply_to_posting',
  array['text', 'text', 'text', 'text', 'text'],
  'posting application is one narrow flow RPC'
);
select has_function(
  'public',
  'hire_posting_application',
  array['uuid'],
  'hire is one atomic flow RPC'
);
select has_function(
  'public',
  'admit_join_request',
  array['uuid'],
  'admission is one atomic flow RPC'
);
select has_function(
  'public',
  'reject_join_request',
  array['uuid'],
  'rejection is one atomic flow RPC'
);
select function_privs_are(
  'public',
  'posting_preview',
  array['text'],
  'anon',
  array['EXECUTE'],
  'anonymous visitors receive only the dedicated posting preview capability'
);

select results_eq(
  $$select enumlabel::text collate "C"
      from pg_enum
     where enumtypid = 'public.posting_intent'::regtype
     order by enumsortorder$$,
  $$values
    ('expression_of_interest'::text collate "C"),
    ('one_time'::text collate "C"),
    ('regular'::text collate "C")$$,
  'a posting carries exactly one of the three product intents'
);
select results_eq(
  $$select enumlabel::text collate "C"
      from pg_enum
     where enumtypid = 'public.join_request_state'::regtype
     order by enumsortorder$$,
  $$values
    ('waiting'::text collate "C"),
    ('admitted'::text collate "C"),
    ('rejected'::text collate "C")$$,
  'a join request has the three person-level states'
);
select results_eq(
  $$select enumlabel::text collate "C"
      from pg_enum
     where enumtypid = 'public.notification_type'::regtype
       and enumlabel in ('hired', 'admitted', 'rejected')
     order by enumlabel::text collate "C"$$,
  $$values
    ('admitted'::text collate "C"),
    ('hired'::text collate "C"),
    ('rejected'::text collate "C")$$,
  'person decisions have durable push event kinds'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  (
    '59000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle-59-admin@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"CLE-59 Admin"}', now(), now(), '', '', '', ''
  ),
  (
    '59000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle-59-candidate-one@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Candidate One"}', now(), now(), '', '', '', ''
  ),
  (
    '59000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle-59-candidate-two@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Candidate Two"}', now(), now(), '', '', '', ''
  ),
  (
    '59000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle-59-candidate-three@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Candidate Three"}', now(), now(), '', '', '', ''
  ),
  (
    '59000000-0000-4000-8000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle-59-staff-cleaner@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Staff Cleaner"}', now(), now(), '', '', '', ''
  ),
  (
    '59000000-0000-4000-8000-000000000006',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle-59-atomic-candidate@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Atomic Candidate"}', now(), now(), '', '', '', ''
  ),
  (
    '59000000-0000-4000-8000-000000000007',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'cle-59-foreign-admin@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Foreign Admin"}', now(), now(), '', '', '', ''
  );

update public.profiles
set phone = '+61 400 590 000', suburb = 'Miami'
where id::text like '59000000-0000-4000-8000-00000000000%';

insert into public.companies (id, name, abn, status)
values
  ('59000000-0000-4000-8000-000000000010', 'CLE-59 Cleaning', '59000000001', 'approved'),
  ('59000000-0000-4000-8000-000000000020', 'CLE-59 Other Cleaning', '59000000002', 'approved');

insert into public.employee_memberships (company_id, profile_id, role)
values
  (
    '59000000-0000-4000-8000-000000000010',
    '59000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '59000000-0000-4000-8000-000000000020',
    '59000000-0000-4000-8000-000000000007',
    'owner'
  );

insert into public.company_members (company_id, profile_id)
values (
  '59000000-0000-4000-8000-000000000010',
  '59000000-0000-4000-8000-000000000005'
);

insert into public.clients (id, company_id, name, phone)
values (
  '59000000-0000-4000-8000-000000000100',
  '59000000-0000-4000-8000-000000000010',
  'Private Client',
  '+61 400 999 999'
);

insert into public.sites (id, client_id, name, address, suburb, access_notes)
values (
  '59000000-0000-4000-8000-000000000200',
  '59000000-0000-4000-8000-000000000100',
  'Private Site',
  '59 Secret Street',
  'Mermaid Beach',
  'Alarm code 5959'
);

insert into public.jobs (
  id, site_id, service_id, scheduled_start, duration_minutes,
  cleaner_pay_cents, client_charge_cents, status, crew_size
) values
  (
    '59000000-0000-4000-8000-000000000301',
    '59000000-0000-4000-8000-000000000200',
    '30000000-0000-4000-8000-000000000002',
    '2099-09-01T08:00:00+10', 120, 12000, 24000, 'posted', 2
  ),
  (
    '59000000-0000-4000-8000-000000000302',
    '59000000-0000-4000-8000-000000000200',
    '30000000-0000-4000-8000-000000000002',
    '2099-09-02T08:00:00+10', 90, 9000, 18000, 'posted', 1
  ),
  (
    '59000000-0000-4000-8000-000000000303',
    '59000000-0000-4000-8000-000000000200',
    '30000000-0000-4000-8000-000000000002',
    '2020-09-03T08:00:00+10', 60, 7000, 14000, 'posted', 1
  ),
  (
    '59000000-0000-4000-8000-000000000304',
    '59000000-0000-4000-8000-000000000200',
    '30000000-0000-4000-8000-000000000002',
    '2099-09-04T08:00:00+10', 60, 8000, 16000, 'posted', 1
  ),
  (
    '59000000-0000-4000-8000-000000000305',
    '59000000-0000-4000-8000-000000000200',
    '30000000-0000-4000-8000-000000000002',
    '2099-09-05T08:00:00+10', 60, 8100, 16200, 'posted', 1
  ),
  (
    '59000000-0000-4000-8000-000000000306',
    '59000000-0000-4000-8000-000000000200',
    '30000000-0000-4000-8000-000000000002',
    '2099-09-06T08:00:00+10', 60, 8200, 16400, 'posted', 1
  ),
  (
    '59000000-0000-4000-8000-000000000307',
    '59000000-0000-4000-8000-000000000200',
    '30000000-0000-4000-8000-000000000002',
    '2099-09-07T08:00:00+10', 60, 8300, 16600, 'cancelled', 1
  );

insert into public.recurring_assignments (
  id, site_id, service_id, frequency, weekday, anchor_date,
  local_start_time, duration_minutes, cleaner_pay_cents, crew_size, active
) values
  (
    '59000000-0000-4000-8000-000000000401',
    '59000000-0000-4000-8000-000000000200',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 1, '2099-01-05', '08:00', 120, 11000, 2, true
  ),
  (
    '59000000-0000-4000-8000-000000000402',
    '59000000-0000-4000-8000-000000000200',
    '30000000-0000-4000-8000-000000000002',
    'weekly', 2, '2099-01-06', '09:00', 90, 10000, 1, false
  );

insert into public.postings (
  id, company_id, code, intent, public_description, job_id,
  recurring_assignment_id, expires_at, application_cap, revoked_at
) values
  (
    '59000000-0000-4000-8000-000000000501',
    '59000000-0000-4000-8000-000000000010',
    'CLE59EOI00000001', 'expression_of_interest',
    'Join our trusted cleaner staff.', null, null, null, null, null
  ),
  (
    '59000000-0000-4000-8000-000000000502',
    '59000000-0000-4000-8000-000000000010',
    'CLE59JOB00000001', 'one_time',
    'Help with this one-time clean.',
    '59000000-0000-4000-8000-000000000301', null, null, null, null
  ),
  (
    '59000000-0000-4000-8000-000000000503',
    '59000000-0000-4000-8000-000000000010',
    'CLE59REG00000001', 'regular',
    'Take on this regular clean.', null,
    '59000000-0000-4000-8000-000000000401', null, null, null
  ),
  (
    '59000000-0000-4000-8000-000000000504',
    '59000000-0000-4000-8000-000000000010',
    'CLE59EXP00000001', 'expression_of_interest',
    'Expired posting.', null, null, now() - interval '1 minute', null, null
  ),
  (
    '59000000-0000-4000-8000-000000000505',
    '59000000-0000-4000-8000-000000000010',
    'CLE59REV00000001', 'expression_of_interest',
    'Revoked posting.', null, null, null, null, now()
  ),
  (
    '59000000-0000-4000-8000-000000000506',
    '59000000-0000-4000-8000-000000000010',
    'CLE59CAP00000001', 'expression_of_interest',
    'Capped posting.', null, null, null, 1, null
  ),
  (
    '59000000-0000-4000-8000-000000000507',
    '59000000-0000-4000-8000-000000000010',
    'CLE59FILL0000001', 'one_time',
    'Filled posting.',
    '59000000-0000-4000-8000-000000000302', null, null, null, null
  ),
  (
    '59000000-0000-4000-8000-000000000508',
    '59000000-0000-4000-8000-000000000010',
    'CLE59PAST0000001', 'one_time',
    'Past-start posting.',
    '59000000-0000-4000-8000-000000000303', null, null, null, null
  ),
  (
    '59000000-0000-4000-8000-000000000509',
    '59000000-0000-4000-8000-000000000010',
    'CLE59REJECT00001', 'one_time',
    'A second application before rejection.',
    '59000000-0000-4000-8000-000000000304', null, null, null, null
  ),
  (
    '59000000-0000-4000-8000-00000000050a',
    '59000000-0000-4000-8000-000000000010',
    'CLE59STAFF000001', 'one_time',
    'An existing-staff application.',
    '59000000-0000-4000-8000-000000000305', null, null, null, null
  ),
  (
    '59000000-0000-4000-8000-00000000050b',
    '59000000-0000-4000-8000-000000000010',
    'CLE59ATOMIC00001', 'one_time',
    'An application whose slot fills before review.',
    '59000000-0000-4000-8000-000000000306', null, null, null, null
  ),
  (
    '59000000-0000-4000-8000-00000000050c',
    '59000000-0000-4000-8000-000000000010',
    'CLE59DUPJOB00001', 'one_time',
    'A second posting for duplicate-job messaging.',
    '59000000-0000-4000-8000-000000000305', null, null, null, null
  ),
  (
    '59000000-0000-4000-8000-00000000050d',
    '59000000-0000-4000-8000-000000000010',
    'CLE59CANCEL00001', 'one_time',
    'Cancelled work must not remain public.',
    '59000000-0000-4000-8000-000000000307', null, null, null, null
  ),
  (
    '59000000-0000-4000-8000-00000000050e',
    '59000000-0000-4000-8000-000000000010',
    'CLE59INACTV00001', 'regular',
    'Inactive regular work must not remain public.', null,
    '59000000-0000-4000-8000-000000000402', null, null, null
  );

select results_eq(
  $$select state, closing_reason, company_name, intent::text, scheduled_start,
           duration_minutes, service_name, suburb, cleaner_pay_cents
      from public.posting_preview('CLE59JOB00000001')$$,
  $$values (
    'active'::text, null::text, 'CLE-59 Cleaning'::text, 'one_time'::text,
    '2099-08-31T22:00:00+00'::timestamptz, 120,
    'Standard clean'::text, 'Mermaid Beach'::text, 12000
  )$$,
  'a one-time public preview derives only its safe work fields from the job'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posting_preview'
      and column_name in ('address', 'access_notes', 'client_charge_cents', 'contact_phone')
  ),
  0,
  'the public posting interface contains no private address, access, charge, or phone field'
);
select ok(
  (
    select row_to_json(preview)::text not like '%59 Secret Street%'
      and row_to_json(preview)::text not like '%Alarm code 5959%'
      and row_to_json(preview)::text not like '%24000%'
      and row_to_json(preview)::text not like '%+61 400 999 999%'
    from public.posting_preview('CLE59JOB00000001') preview
  ),
  'the actual public payload contains no full address, access note, client charge, or client phone'
);

select results_eq(
  $$select code, state, closing_reason
      from public.posting_states
     where id in (
       '59000000-0000-4000-8000-00000000050d',
       '59000000-0000-4000-8000-00000000050e'
     )
     order by code$$,
  $$values
    ('CLE59CANCEL00001'::text, 'dead'::text, 'work_unavailable'::text),
    ('CLE59INACTV00001'::text, 'dead'::text, 'work_unavailable'::text)$$,
  'cancelled one-time and inactive regular targets close their postings'
);
select results_eq(
  $$select state, closing_reason, company_name, public_description
      from public.posting_preview('CLE59CANCEL00001')$$,
  $$values ('dead'::text, 'work_unavailable'::text, null::text, null::text)$$,
  'a cancelled job is no longer advertised through the anonymous preview'
);
select results_eq(
  $$select state, closing_reason, company_name, public_description
      from public.posting_preview('CLE59INACTV00001')$$,
  $$values ('dead'::text, 'work_unavailable'::text, null::text, null::text)$$,
  'an inactive regular assignment is no longer advertised through the anonymous preview'
);

select results_eq(
  $$select code, state, closing_reason
      from public.posting_states
     where id between '59000000-0000-4000-8000-000000000501'::uuid
                  and '59000000-0000-4000-8000-000000000508'::uuid
     order by code$$,
  $$values
    ('CLE59CAP00000001'::text, 'active'::text, null::text),
    ('CLE59EOI00000001'::text, 'active'::text, null::text),
    ('CLE59EXP00000001'::text, 'dead'::text, 'expired'::text),
    ('CLE59FILL0000001'::text, 'active'::text, null::text),
    ('CLE59JOB00000001'::text, 'active'::text, null::text),
    ('CLE59PAST0000001'::text, 'dead'::text, 'start_passed'::text),
    ('CLE59REG00000001'::text, 'active'::text, null::text),
    ('CLE59REV00000001'::text, 'dead'::text, 'revoked'::text)$$,
  'postings coexist with independent lifecycle states'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_posting(
    'CLE59EOI00000001', 'Candidate One', '+61 400 590 002', 'Miami', 'Ready to help'
  )$$,
  'a candidate applies through an expression-of-interest posting'
);
select lives_ok(
  $$select public.apply_to_posting(
    'CLE59JOB00000001', 'Candidate One', '+61 400 590 002', 'Miami', null
  )$$,
  'the same candidate applies through a one-time posting'
);
select lives_ok(
  $$select public.apply_to_posting(
    'CLE59REG00000001', 'Candidate One', '+61 400 590 002', 'Miami', null
  )$$,
  'the same candidate applies through a regular posting'
);
reset role;

select results_eq(
  $$select
      (select count(*)::integer from public.join_requests
        where company_id = '59000000-0000-4000-8000-000000000010'
          and profile_id = '59000000-0000-4000-8000-000000000002'),
      (select count(*)::integer from public.job_applications
        where join_request_id = (
          select id from public.join_requests
          where company_id = '59000000-0000-4000-8000-000000000010'
            and profile_id = '59000000-0000-4000-8000-000000000002'
        )),
      (select count(distinct posting_id)::integer from public.job_applications
        where cleaner_id = '59000000-0000-4000-8000-000000000002')$$,
  $$values (1, 3, 3)$$,
  'one company-person join request owns many posting-attributed applications'
);

select set_config(
  'test.cle_59_foreign_hire_application',
  (
    select id::text
    from public.job_applications
    where posting_id = '59000000-0000-4000-8000-000000000502'
      and cleaner_id = '59000000-0000-4000-8000-000000000002'
  ),
  true
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.postings),
  0,
  'an owner cannot read another company''s postings'
);
select is(
  (select count(*)::integer from public.join_requests),
  0,
  'an owner cannot read another company''s join requests'
);
select throws_ok(
  $$select public.create_posting(
    '59000000-0000-4000-8000-000000000010',
    'expression_of_interest', 'Foreign company posting.', null, null, null, null
  )$$,
  '42501', 'Company admin access required',
  'an owner cannot create a posting for another company'
);
select throws_ok(
  $$select public.hire_posting_application(
    current_setting('test.cle_59_foreign_hire_application')::uuid
  )$$,
  '42501', 'Company admin access required',
  'an owner cannot hire another company''s candidate'
);
reset role;

select results_eq(
  $$select intent::text, application_count
      from public.posting_states
     where id in (
       '59000000-0000-4000-8000-000000000501',
       '59000000-0000-4000-8000-000000000502',
       '59000000-0000-4000-8000-000000000503'
     )
     order by intent::text collate "C"$$,
  $$values
    ('expression_of_interest'::text, 1),
    ('one_time'::text, 1),
    ('regular'::text, 1)$$,
  'each posting reports its own application count'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_posting(
    'CLE59CAP00000001', 'Candidate Two', '+61 400 590 003', 'Miami', null
  )$$,
  'the first application takes the capped posting place'
);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE59CAP00000001', 'Candidate Two', '+61 400 590 003', 'Miami', null
  )$$,
  '23514',
  'Posting is no longer active',
  'the capped posting refuses another application'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_posting(
    'CLE59REG00000001', 'Candidate Two', '+61 400 590 003', 'Miami', null
  )$$,
  'a candidate with one join request can also apply for regular work'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.hire_posting_application(
    (select id from public.job_applications
      where posting_id = '59000000-0000-4000-8000-000000000503'
        and cleaner_id = '59000000-0000-4000-8000-000000000003')
  )$$,
  'regular hire treats the application as standing series-level consent'
);
reset role;

select results_eq(
  $$select
      request.state::text,
      application.status::text,
      named.accepted_at is not null,
      (select count(*)::integer from public.company_members membership
        where membership.company_id = request.company_id
          and membership.profile_id = request.profile_id
          and membership.status = 'active'),
      (select count(*)::integer from public.notifications notification
        where notification.recipient_id = request.profile_id
          and notification.type = 'hired'
          and notification.recurring_assignment_id = application.recurring_assignment_id)
    from public.join_requests request
    join public.job_applications application on application.join_request_id = request.id
    join public.recurring_assignment_cleaners named
      on named.recurring_assignment_id = application.recurring_assignment_id
     and named.cleaner_id = request.profile_id
   where request.profile_id = '59000000-0000-4000-8000-000000000003'
     and application.posting_id = '59000000-0000-4000-8000-000000000503'$$,
  $$values ('admitted'::text, 'hired'::text, true, 1, 1)$$,
  'regular hire atomically admits, records consent, and carries the series reference'
);

insert into public.job_assignments (job_id, slot_number, cleaner_id, source)
values (
  '59000000-0000-4000-8000-000000000302', 1,
  '59000000-0000-4000-8000-000000000005', 'manual'
);
update public.jobs set status = 'assigned'
where id = '59000000-0000-4000-8000-000000000302';

select results_eq(
  $$select code, closing_reason
      from public.posting_states
     where code in (
       'CLE59EXP00000001', 'CLE59REV00000001', 'CLE59CAP00000001',
       'CLE59FILL0000001', 'CLE59PAST0000001'
     )
     order by closing_reason collate "C"$$,
  $$values
    ('CLE59CAP00000001'::text, 'cap_reached'::text),
    ('CLE59EXP00000001'::text, 'expired'::text),
    ('CLE59FILL0000001'::text, 'filled'::text),
    ('CLE59REV00000001'::text, 'revoked'::text),
    ('CLE59PAST0000001'::text, 'start_passed'::text)$$,
  'expiry, revocation, cap, fill, and start time each derive the required dead reason'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE59EXP00000001', 'Atomic Candidate', '+61 400 590 006', 'Miami', null
  )$$,
  '23514', 'Posting is no longer active',
  'an expired posting refuses new applications'
);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE59REV00000001', 'Atomic Candidate', '+61 400 590 006', 'Miami', null
  )$$,
  '23514', 'Posting is no longer active',
  'a revoked posting refuses new applications'
);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE59FILL0000001', 'Atomic Candidate', '+61 400 590 006', 'Miami', null
  )$$,
  '23514', 'Posting is no longer active',
  'a filled posting refuses new applications'
);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE59PAST0000001', 'Atomic Candidate', '+61 400 590 006', 'Miami', null
  )$$,
  '23514', 'Posting is no longer active',
  'a past-start posting refuses new applications'
);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE59CANCEL00001', 'Atomic Candidate', '+61 400 590 006', 'Miami', null
  )$$,
  '23514', 'Posting is no longer active',
  'a cancelled one-time target refuses new applications'
);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE59INACTV00001', 'Atomic Candidate', '+61 400 590 006', 'Miami', null
  )$$,
  '23514', 'Posting is no longer active',
  'an inactive regular target refuses new applications'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_posting(
    'CLE59JOB00000001', 'Candidate Three', '+61 400 590 004', 'Miami', null
  )$$,
  'a second person creates a waiting join request for the hire path'
);
select lives_ok(
  $$select public.apply_to_posting(
    'CLE59REJECT00001', 'Candidate Three', '+61 400 590 004', 'Miami', null
  )$$,
  'the same waiting request owns another open application'
);
select is(
  (select count(*)::integer from public.cleaner_job_board),
  0,
  'a waiting candidate reads no cleaner board rows'
);
select is(
  (select count(*)::integer from public.vacancies),
  0,
  'a waiting candidate reads no vacancy rows'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.hire_posting_application(
    (select id from public.job_applications
      where posting_id = '59000000-0000-4000-8000-000000000502'
        and cleaner_id = '59000000-0000-4000-8000-000000000004')
  )$$,
  'hire admits the candidate and assigns the applied-for one-time job atomically'
);
reset role;

select results_eq(
  $$select
      request.state::text,
      hired.status::text,
      other_application.status::text,
      (select count(*)::integer from public.company_members membership
        where membership.company_id = request.company_id
          and membership.profile_id = request.profile_id
          and membership.status = 'active'),
      (select count(*)::integer from public.job_assignments assignment
        where assignment.job_id = hired.job_id
          and assignment.cleaner_id = request.profile_id
          and assignment.unassigned_at is null),
      (select count(*)::integer from public.notifications notification
        where notification.recipient_id = request.profile_id
          and notification.type = 'hired'
          and notification.job_id = hired.job_id)
    from public.join_requests request
    join public.job_applications hired
      on hired.join_request_id = request.id
     and hired.posting_id = '59000000-0000-4000-8000-000000000502'
    join public.job_applications other_application
      on other_application.join_request_id = request.id
     and other_application.posting_id = '59000000-0000-4000-8000-000000000509'
   where request.profile_id = '59000000-0000-4000-8000-000000000004'$$,
  $$values ('admitted'::text, 'hired'::text, 'applied'::text, 1, 1, 1)$$,
  'hire commits membership, assignment, decision event, and preserves other applications'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_posting(
    'CLE59STAFF000001', 'Staff Cleaner', '+61 400 590 005', 'Miami', null
  )$$,
  'an existing staff cleaner applies through a posting'
);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE59REG00000001', 'Staff Cleaner', '+61 400 590 005', 'Miami', null
  )$$,
  '23514',
  'Regular posting applications are not available to existing cleaner staff',
  'an existing staff cleaner cannot create an orphaned regular application'
);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE59DUPJOB00001', 'Staff Cleaner', '+61 400 590 005', 'Miami', null
  )$$,
  '23505',
  'Cleaner can apply only once per job',
  'a second posting for the same job reports the job collision accurately'
);
reset role;

select results_eq(
  $$select
      (select count(*)::integer from public.join_requests
        where company_id = '59000000-0000-4000-8000-000000000010'
          and profile_id = '59000000-0000-4000-8000-000000000005'),
      (select count(*)::integer from public.job_applications
        where posting_id = '59000000-0000-4000-8000-00000000050a'
          and cleaner_id = '59000000-0000-4000-8000-000000000005'
          and join_request_id is null
          and job_id = '59000000-0000-4000-8000-000000000305')$$,
  $$values (0, 1)$$,
  'the staff cleaner receives a plain board application with posting attribution and no join request'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_posting(
    'CLE59ATOMIC00001', 'Atomic Candidate', '+61 400 590 006', 'Miami', null
  )$$,
  'a candidate applies before the last slot fills elsewhere'
);
reset role;

insert into public.job_assignments (job_id, slot_number, cleaner_id, source)
values (
  '59000000-0000-4000-8000-000000000306', 1,
  '59000000-0000-4000-8000-000000000005', 'manual'
);
update public.jobs set status = 'assigned'
where id = '59000000-0000-4000-8000-000000000306';

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.hire_posting_application(
    (select id from public.job_applications
      where posting_id = '59000000-0000-4000-8000-00000000050b'
        and cleaner_id = '59000000-0000-4000-8000-000000000006')
  )$$,
  '23514',
  'No open slot is available',
  'a hire whose assignment cannot commit fails as one act'
);
reset role;

select results_eq(
  $$select
      (select count(*)::integer from public.company_members
        where company_id = '59000000-0000-4000-8000-000000000010'
          and profile_id = '59000000-0000-4000-8000-000000000006'),
      (select state::text from public.join_requests
        where company_id = '59000000-0000-4000-8000-000000000010'
          and profile_id = '59000000-0000-4000-8000-000000000006'),
      (select status::text from public.job_applications
        where posting_id = '59000000-0000-4000-8000-00000000050b'
          and cleaner_id = '59000000-0000-4000-8000-000000000006')$$,
  $$values (0, 'waiting'::text, 'applied'::text)$$,
  'failed hire rolls membership, join-request state, and application state back together'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select application_state::text
      from public.cleaner_join_request_state
     where posting_id = '59000000-0000-4000-8000-00000000050b'$$,
  $$values ('job_filled'::text)$$,
  'a waiting candidate sees job filled without receiving vacancy data'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.reject_join_request(
    (select id from public.join_requests
      where company_id = '59000000-0000-4000-8000-000000000010'
        and profile_id = '59000000-0000-4000-8000-000000000002')
  )$$,
  'an employee rejects the person without recording a reason'
);
reset role;

select results_eq(
  $$select request.state::text,
           count(*) filter (where application.status = 'withdrawn')::integer,
           (select count(*)::integer from public.notifications notification
             where notification.join_request_id = request.id
               and notification.type = 'rejected')
      from public.join_requests request
      join public.job_applications application on application.join_request_id = request.id
     where request.profile_id = '59000000-0000-4000-8000-000000000002'
     group by request.id, request.state$$,
  $$values ('rejected'::text, 3, 1)$$,
  'rejection is person-level, withdraws every open application, and records one event'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE59REJECT00001', 'Candidate One', '+61 400 590 002', 'Miami', null
  )$$,
  '42501',
  'This company rejected your join request',
  'a rejected person cannot create another request through another posting'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.admit_join_request(
    (select id from public.join_requests
      where company_id = '59000000-0000-4000-8000-000000000010'
        and profile_id = '59000000-0000-4000-8000-000000000002')
  )$$,
  'an employee can recover a rejected request by admitting it later'
);
reset role;

select results_eq(
  $$select request.state::text,
           (select count(*)::integer from public.company_members membership
             where membership.company_id = request.company_id
               and membership.profile_id = request.profile_id
               and membership.status = 'active'),
           (select count(*)::integer from public.notifications notification
             where notification.join_request_id = request.id
               and notification.type = 'admitted')
      from public.join_requests request
     where request.profile_id = '59000000-0000-4000-8000-000000000002'$$,
  $$values ('admitted'::text, 1, 1)$$,
  'later admission restores the relationship and creates one cleaner membership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select application_state::text
      from public.cleaner_join_request_state
     where posting_id = '59000000-0000-4000-8000-000000000506'$$,
  $$values ('posting_closed'::text)$$,
  'a capped posting shows its surviving application as posting closed'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.notifications notification
    where notification.type not in ('hired', 'admitted', 'rejected')
      and notification.recipient_id in (
        '59000000-0000-4000-8000-000000000002',
        '59000000-0000-4000-8000-000000000003',
        '59000000-0000-4000-8000-000000000004'
      )
      and notification.created_at >= transaction_timestamp()
  ),
  0,
  'posting closure and application end states create no candidate push event'
);

select * from finish();
rollback;
