-- Regressions for the two database findings of the 2026-08-22 security scan:
-- an unbounded crew size that drives generate_series row expansion, and a
-- six-character cleaner invite code with an anonymous validity oracle.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Crew size carries an authoritative upper bound
-- ---------------------------------------------------------------------------

select col_has_check('public', 'jobs', 'crew_size', 'jobs constrain crew size in the database');
select col_has_check(
  'public',
  'recurring_assignments',
  'crew_size',
  'recurring assignments constrain crew size in the database'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- The maximum the CRM already offered stays callable.
select set_config(
  'test.hardening_max_crew_job',
  public.create_one_off_job(
    target_site_id => '10000000-0000-4000-8000-000000000401',
    target_service_id => '30000000-0000-4000-8000-000000000002',
    target_local_date => '2099-10-01',
    target_local_start_time => '08:00',
    target_duration_minutes => 60,
    target_cleaner_pay_cents => 9000,
    target_crew_size => 20,
    target_post_now => false
  )::text,
  true
);
select is(
  (
    select crew_size
    from public.jobs
    where id = current_setting('test.hardening_max_crew_job')::uuid
  ),
  20,
  'a crew of twenty is still accepted by the creation RPC'
);

-- A direct RPC caller cannot go past it, whatever the CRM form allows.
select throws_ok(
  $$select public.create_one_off_job(
    target_site_id => '10000000-0000-4000-8000-000000000401',
    target_service_id => '30000000-0000-4000-8000-000000000002',
    target_local_date => '2099-10-02',
    target_local_start_time => '08:00',
    target_duration_minutes => 60,
    target_cleaner_pay_cents => 9000,
    target_crew_size => 21,
    target_post_now => false
  )$$,
  '23514',
  'Crew size must be 20 or fewer',
  'the creation RPC rejects a crew size one past the maximum'
);
select throws_ok(
  $$select public.create_one_off_job(
    target_site_id => '10000000-0000-4000-8000-000000000401',
    target_service_id => '30000000-0000-4000-8000-000000000002',
    target_local_date => '2099-10-03',
    target_local_start_time => '08:00',
    target_duration_minutes => 60,
    target_cleaner_pay_cents => 9000,
    target_crew_size => 2000000,
    target_post_now => false
  )$$,
  '23514',
  'Crew size must be 20 or fewer',
  'the creation RPC rejects an integer-scale crew size'
);
select is(
  (
    select count(*)::integer
    from public.jobs
    where scheduled_start >= '2099-10-02T00:00:00+10'::timestamptz
  ),
  0,
  'a rejected oversized call writes no job row'
);

reset role;

-- The table constraint is the backstop: no write path, RPC or otherwise, can
-- store a crew size the vacancy view would then expand.
select throws_ok(
  $$insert into public.jobs (
      site_id, service_id, scheduled_start, duration_minutes,
      cleaner_pay_cents, status, crew_size
    ) values (
      '10000000-0000-4000-8000-000000000401',
      '30000000-0000-4000-8000-000000000002',
      '2099-10-04T08:00:00+10'::timestamptz,
      60,
      9000,
      'draft',
      100000
    )$$,
  '23514',
  null,
  'a privileged writer cannot store an oversized crew size either'
);
select throws_ok(
  $$update public.recurring_assignments set crew_size = 100000$$,
  '23514',
  null,
  'recurring assignments cannot be widened past the maximum'
);

-- ---------------------------------------------------------------------------
-- Posting links replace the retired cleaner-invite singleton with high entropy
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::integer
    from public.company_invites
    where revoked_at is null
      and char_length(code) < 16
  ),
  0,
  'no usable invite carries a legacy short code'
);
select throws_ok(
  $$insert into public.company_invites (company_id, code)
    values ('10000000-0000-4000-8000-000000000010', 'SHORT1')$$,
  '23514',
  null,
  'a short code cannot be inserted as a usable invite'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config(
  'test.hardening_posting_id',
  public.create_posting(
    '10000000-0000-4000-8000-000000000010',
    'expression_of_interest',
    'Security regression posting.',
    null, null, null, null
  )::text,
  true
);
select is(
  (
    select char_length(code)
    from public.postings
    where id = current_setting('test.hardening_posting_id')::uuid
  ),
  16,
  'posting creation issues a sixteen-character code (80 bits, not 30)'
);
select ok(
  (
    select code ~ '^[A-Z0-9]{16}$'
    from public.postings
    where id = current_setting('test.hardening_posting_id')::uuid
  ),
  'the posting code stays URL and link safe'
);

reset role;

-- The posting preview names the company for a live link, and for nothing else.
select is(
  (
    select preview.company_name
    from public.postings posting
    cross join lateral public.posting_preview(posting.code) preview
    where posting.id = current_setting('test.hardening_posting_id')::uuid
  ),
  'Coastal Demo Cleaning',
  'an active posting names the company for the public application page'
);
select is(
  (select state from public.cleaner_invite_preview('ZOLD01')),
  'revoked',
  'a superseded code is still reported as revoked'
);
select is(
  (select company_name from public.cleaner_invite_preview('ZOLD01')),
  null,
  'a revoked code no longer discloses which company issued it'
);
select is(
  (select pool_size from public.cleaner_invite_preview('ZOLD01')),
  0,
  'a revoked code no longer discloses the cleaner count'
);
select is(
  (select company_name from public.posting_preview('NOSUCHCODE000000')),
  null,
  'an unknown posting code discloses nothing'
);

select * from finish();
rollback;
