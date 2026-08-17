begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Shape, grants, and RLS ---------------------------------------------------

select has_table('public', 'pool_invite_email_batches', 'confirmed batches are persisted');
select has_table('public', 'pool_invite_email_recipients', 'recipient outcomes are persisted');
select is(
  (select count(*)::integer from information_schema.routines
   where routine_schema = 'public' and routine_name = 'prepare_pool_invite_email_batch'),
  1,
  'batch preparation is one RPC'
);
select is(
  (select count(*)::integer from information_schema.routines
   where routine_schema = 'public' and routine_name = 'prepare_pool_invite_email_retry'),
  1,
  'retry preparation is one RPC'
);
select is(
  (select count(*)::integer from information_schema.routines
   where routine_schema = 'public' and routine_name = 'record_pool_invite_email_results'),
  1,
  'provider outcomes are recorded through one RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.pool_invite_email_batches', 'INSERT,UPDATE,DELETE'),
  'authenticated users cannot mutate batches directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.pool_invite_email_recipients', 'INSERT,UPDATE,DELETE'),
  'authenticated users cannot mutate recipients directly'
);
select ok(
  has_table_privilege('authenticated', 'public.pool_invite_email_batches', 'SELECT'),
  'authenticated admins have an explicit batch read grant'
);
select ok(
  has_table_privilege('authenticated', 'public.pool_invite_email_recipients', 'SELECT'),
  'authenticated admins have an explicit recipient read grant'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.prepare_pool_invite_email_batch(uuid,uuid,public.app_locale,uuid,boolean,jsonb)',
    'EXECUTE'
  ),
  'anonymous callers cannot prepare a batch'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.prepare_pool_invite_email_batch(uuid,uuid,public.app_locale,uuid,boolean,jsonb)',
    'EXECUTE'
  ),
  'authenticated admins can prepare a batch through the RPC'
);

-- Deterministic fixtures ---------------------------------------------------

update public.company_invites
set revoked_at = now()
where company_id = '10000000-0000-4000-8000-000000000010'
  and revoked_at is null;

insert into public.company_invites (id, company_id, code)
values (
  '79000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000010',
  'MAIL79'
);

insert into public.companies (id, name, abn, status)
values ('79000000-0000-4000-8000-000000000010', 'Other Tenant', '79000000001', 'approved');
update public.profiles
set role = 'company_admin'
where id = '10000000-0000-4000-8000-000000000005';
insert into public.company_members (company_id, profile_id, status)
values (
  '79000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000005',
  'active'
)
on conflict (company_id, profile_id) do update set status = 'active';

-- Confirmed send and idempotency ------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::integer
    from public.prepare_pool_invite_email_batch(
      '10000000-0000-4000-8000-000000000010',
      '79000000-0000-4000-8000-000000000001',
      'en-AU',
      '79000000-0000-4000-8000-000000000020',
      true,
      '[{"email":"Ana@Example.com","name":"Ana"},{"email":"ana@example.COM","name":"Duplicate"},{"email":"bruno@example.com","name":null}]'::jsonb
    )
  ),
  2,
  'preparation normalises and deduplicates recipients case-insensitively'
);
select is(
  (
    select count(*)::integer
    from public.prepare_pool_invite_email_batch(
      '10000000-0000-4000-8000-000000000010',
      '79000000-0000-4000-8000-000000000001',
      'en-AU',
      '79000000-0000-4000-8000-000000000020',
      true,
      '[{"email":"new-recipient@example.com","name":null}]'::jsonb
    )
  ),
  2,
  'the same confirmation key returns the original logical batch'
);
select is(
  (
    select count(distinct batch_id)::integer
    from public.pool_invite_email_recipients
    where email in ('ana@example.com', 'bruno@example.com')
  ),
  1,
  'a repeated confirmation does not create another batch'
);
reset role;
select is((select count(*)::integer from auth.users), 5,
  'preparing a send list does not create an Auth user');
select is(
  (select count(*)::integer from public.company_members
   where company_id = '10000000-0000-4000-8000-000000000010'),
  5,
  'preparing a send list does not create a company membership'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.prepare_pool_invite_email_batch(
    '10000000-0000-4000-8000-000000000010',
    '79000000-0000-4000-8000-000000000001',
    'en-AU',
    '79000000-0000-4000-8000-000000000021',
    false,
    '[{"email":"ana@example.com"}]'::jsonb
  )$$,
  '22023',
  'Recipient authority confirmation is required',
  'the database rejects an unconfirmed recipient list'
);

-- Record a partial provider outcome ---------------------------------------

select lives_ok(
  $$select public.record_pool_invite_email_results(
    (select id from public.pool_invite_email_batches
     where confirmation_key = '79000000-0000-4000-8000-000000000020'),
    0,
    jsonb_build_array(
      jsonb_build_object(
        'recipient_id', (select id from public.pool_invite_email_recipients
                         where email = 'ana@example.com'),
        'status', 'accepted',
        'provider_message_id', 'resend-ana',
        'failure_reason', null
      ),
      jsonb_build_object(
        'recipient_id', (select id from public.pool_invite_email_recipients
                         where email = 'bruno@example.com'),
        'status', 'failed',
        'provider_message_id', null,
        'failure_reason', 'provider_rejected'
      )
    )
  )$$,
  'accepted and failed provider outcomes can be recorded together'
);
select is(
  (select count(*)::integer from public.pool_invite_email_recipients where status = 'accepted'),
  1,
  'the accepted recipient is retained'
);
select is(
  (select count(*)::integer from public.pool_invite_email_recipients where status = 'failed'),
  1,
  'the failed recipient is retained for an explicit retry'
);
select is(
  (
    select count(*)::integer
    from public.prepare_pool_invite_email_retry(
      (select id from public.pool_invite_email_batches
       where confirmation_key = '79000000-0000-4000-8000-000000000020'),
      '79000000-0000-4000-8000-000000000030'
    )
    where status = 'pending' and attempt_number = 1
  ),
  1,
  'retry prepares the failed recipient only as the next attempt'
);
select is(
  (
    select count(*)::integer
    from public.prepare_pool_invite_email_retry(
      (select id from public.pool_invite_email_batches
       where confirmation_key = '79000000-0000-4000-8000-000000000020'),
      '79000000-0000-4000-8000-000000000030'
    )
    where status = 'pending' and attempt_number = 1
  ),
  1,
  'repeating the retry key keeps the same attempt'
);
select is(
  (select count(*)::integer from public.pool_invite_email_recipients
   where email = 'ana@example.com' and status = 'accepted' and attempt_number = 0),
  1,
  'retry never resets an accepted recipient'
);
reset role;

-- Tenant isolation ---------------------------------------------------------

select set_config(
  'cle79.batch_id',
  (select id::text from public.pool_invite_email_batches
   where confirmation_key = '79000000-0000-4000-8000-000000000020'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.pool_invite_email_batches), 0,
  'another company admin cannot read the batch');
select is((select count(*)::integer from public.pool_invite_email_recipients), 0,
  'another company admin cannot read recipient addresses or outcomes');
select throws_ok(
  $$select public.prepare_pool_invite_email_retry(
    current_setting('cle79.batch_id')::uuid,
    '79000000-0000-4000-8000-000000000031'
  )$$,
  '42501',
  'Company admin access required',
  'another company admin cannot retry a batch outside its company'
);
reset role;

select ok(
  has_table_privilege('service_role', 'public.pool_invite_email_batches', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role has explicit batch access'
);
select ok(
  has_table_privilege('service_role', 'public.pool_invite_email_recipients', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role has explicit recipient access'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_pool_invite_email_results(uuid,integer,jsonb)',
    'EXECUTE'
  ),
  'service role has an explicit outcome RPC grant'
);

select * from finish();
rollback;
