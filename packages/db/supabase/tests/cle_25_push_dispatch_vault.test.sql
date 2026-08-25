begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Push dispatch credentials must live somewhere a deployment can actually write them.
-- `alter database ... set app.settings.*` is rejected for every role a Supabase project
-- can assume (supautils reserves the prefix for `supabase_admin`), so the enqueue trigger
-- reads its bearer and URL from Supabase Vault instead.

-- The trigger no longer depends on settings no deployable role can persist.
select ok(
  (
    select pg_get_functiondef(procedure.oid)
    from pg_trigger trigger
    join pg_proc procedure on procedure.oid = trigger.tgfoid
    where trigger.tgrelid = 'public.notifications'::regclass
      and not trigger.tgisinternal
      and pg_get_functiondef(procedure.oid) ~* 'net[.]http_post'
    limit 1
  ) !~ 'app[.]settings[.]push_dispatch',
  'dispatch does not depend on app.settings GUCs no deployable role can set'
);
select ok(
  (
    select pg_get_functiondef(procedure.oid)
    from pg_trigger trigger
    join pg_proc procedure on procedure.oid = trigger.tgfoid
    where trigger.tgrelid = 'public.notifications'::regclass
      and not trigger.tgisinternal
      and pg_get_functiondef(procedure.oid) ~* 'net[.]http_post'
    limit 1
  ) ~ 'vault[.]decrypted_secrets',
  'dispatch reads its credentials from Supabase Vault'
);

-- The vault boundary keeps the shared webhook secret away from signed-in users.
select throws_ok(
  $$set local role authenticated;
    select decrypted_secret from vault.decrypted_secrets$$,
  '42501',
  null,
  'signed-in users cannot read dispatch credentials out of the vault'
);

insert into public.jobs (
  id, site_id, service_id, scheduled_start, duration_minutes,
  cleaner_pay_cents, client_charge_cents, status, crew_size, notes
) values (
  '25000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000401',
  '30000000-0000-4000-8000-000000000002',
  '2099-10-01T08:00:00+10', 60, 9000, 15000, 'posted', 1,
  'CLE-25 vault dispatch fixture'
);

-- Given no stored bearer, dispatch stays disabled and the durable insert still succeeds.
delete from net.http_request_queue;
select lives_ok(
  $$insert into public.notifications (recipient_id, job_id, type)
    values (
      '10000000-0000-4000-8000-000000000002',
      '25000000-0000-4000-8000-000000000901',
      'job_assigned'
    )$$,
  'a missing vault credential never fails the notification insert'
);
select is(
  (select count(*)::integer from net.http_request_queue),
  0,
  'an unconfigured dispatch boundary queues nothing'
);

-- Given only a bearer, dispatch falls back to the local functions gateway.
select vault.create_secret('cle-25-vault-test-secret', 'push_dispatch_bearer');
delete from net.http_request_queue;
insert into public.notifications (recipient_id, job_id, type)
values (
  '10000000-0000-4000-8000-000000000002',
  '25000000-0000-4000-8000-000000000901',
  'job_assigned'
);
select results_eq(
  $$select url, headers ->> 'Authorization' from net.http_request_queue$$,
  $$values (
    'http://kong:8000/functions/v1/push-dispatch'::text,
    'Bearer cle-25-vault-test-secret'::text
  )$$,
  'a stored bearer dispatches to the default gateway with its Authorization header'
);

-- Given a stored URL, hosted deployments override the gateway.
select vault.create_secret(
  'https://project-ref.supabase.co/functions/v1/push-dispatch',
  'push_dispatch_url'
);
delete from net.http_request_queue;
insert into public.notifications (recipient_id, job_id, type)
values (
  '10000000-0000-4000-8000-000000000002',
  '25000000-0000-4000-8000-000000000901',
  'job_assigned'
);
select results_eq(
  $$select url from net.http_request_queue$$,
  $$values ('https://project-ref.supabase.co/functions/v1/push-dispatch'::text)$$,
  'a stored dispatch URL overrides the local gateway default'
);

-- The production path inserts as `authenticated` through an RPC, not as the table owner.
delete from net.http_request_queue;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.assign_job_slot(
      '25000000-0000-4000-8000-000000000901',
      1,
      '10000000-0000-4000-8000-000000000002'
    )$$,
  'assigning a slot as a signed-in user succeeds'
);
reset role;
select is(
  (
    select count(*)::integer
    from net.http_request_queue
    where (convert_from(body, 'UTF8')::jsonb ->> 'jobId')
      = '25000000-0000-4000-8000-000000000901'
  ),
  1,
  'a signed-in caller reaches the vault through the definer and enqueues one dispatch'
);
select results_eq(
  $$select headers ->> 'Authorization'
    from net.http_request_queue
    where (convert_from(body, 'UTF8')::jsonb ->> 'jobId')
      = '25000000-0000-4000-8000-000000000901'$$,
  $$values ('Bearer cle-25-vault-test-secret'::text)$$,
  'the signed-in dispatch carries the stored bearer without exposing it to the caller'
);

select * from finish();
rollback;
