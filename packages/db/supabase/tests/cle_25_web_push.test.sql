begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Subscription storage is self-readable but writable only through narrow RPCs.
select has_table('public', 'push_subscriptions', 'push subscriptions have a durable table');
select results_eq(
  $$select column_name::text collate "C", data_type::text collate "C",
           is_nullable::text collate "C"
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_subscriptions'
    order by ordinal_position$$,
  $$values
    ('id'::text collate "C", 'uuid'::text collate "C", 'NO'::text collate "C"),
    ('profile_id'::text collate "C", 'uuid'::text collate "C", 'NO'::text collate "C"),
    ('endpoint'::text collate "C", 'text'::text collate "C", 'NO'::text collate "C"),
    ('p256dh'::text collate "C", 'text'::text collate "C", 'NO'::text collate "C"),
    ('auth'::text collate "C", 'text'::text collate "C", 'NO'::text collate "C"),
    ('created_at'::text collate "C", 'timestamp with time zone'::text collate "C", 'NO'::text collate "C")$$,
  'push subscriptions expose only the reviewed columns'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass),
  'push subscriptions have RLS enabled'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass
      and contype = 'p'
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.push_subscriptions'::regclass
            and attname = 'id'
        )
      ]::smallint[]
  ),
  'subscription id is the primary key'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass
      and contype = 'u'
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.push_subscriptions'::regclass
            and attname = 'endpoint'
        )
      ]::smallint[]
  ),
  'subscription endpoint is globally unique'
);
select is(
  (
    select constraint_row.delete_rule::text
    from information_schema.referential_constraints constraint_row
    where constraint_row.constraint_schema = 'public'
      and constraint_row.constraint_name = 'push_subscriptions_profile_id_fkey'
  ),
  'CASCADE'::text,
  'profile deletion cascades to its subscriptions'
);
select is(
  (
    select column_default::text
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_subscriptions'
      and column_name = 'created_at'
  ),
  'now()'::text,
  'subscription creation time defaults to now'
);
select ok(
  has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT')
    and not has_table_privilege(
      'authenticated',
      'public.push_subscriptions',
      'INSERT,UPDATE,DELETE'
    )
    and has_table_privilege(
      'service_role',
      'public.push_subscriptions',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
  'authenticated callers select only and service role has explicit DML grants'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_push_subscription(text,text,text)',
    'EXECUTE'
  )
    and has_function_privilege(
      'authenticated',
      'public.delete_push_subscription(text)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.save_push_subscription(text,text,text)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.delete_push_subscription(text)',
      'EXECUTE'
    ),
  'only authenticated and service callers can execute subscription RPCs'
);
select ok(
  (
    select bool_and(procedure.prosecdef)
    from pg_proc procedure
    where procedure.oid in (
      'public.save_push_subscription(text,text,text)'::regprocedure,
      'public.delete_push_subscription(text)'::regprocedure
    )
  )
    and pg_get_function_result(
      'public.save_push_subscription(text,text,text)'::regprocedure
    ) = 'void'
    and pg_get_function_result(
      'public.delete_push_subscription(text)'::regprocedure
    ) = 'void',
  'subscription mutations are security-definer void RPCs'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.save_push_subscription('https://push.example/anonymous', 'key', 'auth')$$,
  '42501',
  null,
  'an unauthenticated caller cannot save a subscription'
);
select throws_ok(
  $$select public.delete_push_subscription('https://push.example/anonymous')$$,
  '42501',
  null,
  'an unauthenticated caller cannot delete a subscription'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.save_push_subscription('   ', 'key', 'auth')$$,
  '23514',
  null,
  'a blank endpoint is rejected'
);
select throws_ok(
  $$select public.save_push_subscription('https://push.example/a', '   ', 'auth')$$,
  '23514',
  null,
  'a blank p256dh key is rejected'
);
select throws_ok(
  $$select public.save_push_subscription('https://push.example/a', 'key', '   ')$$,
  '23514',
  null,
  'a blank auth key is rejected'
);
select lives_ok(
  $$select public.save_push_subscription('https://push.example/shared', 'key-a', 'auth-a')$$,
  'a cleaner can save a valid subscription'
);
select throws_ok(
  $$insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
    values (
      '10000000-0000-4000-8000-000000000002',
      'https://push.example/direct',
      'key',
      'auth'
    )$$,
  '42501',
  null,
  'authenticated callers cannot insert subscriptions directly'
);
reset role;

select results_eq(
  $$select profile_id, endpoint, p256dh, auth
    from public.push_subscriptions
    where endpoint = 'https://push.example/shared'$$,
  $$values (
    '10000000-0000-4000-8000-000000000002'::uuid,
    'https://push.example/shared'::text,
    'key-a'::text,
    'auth-a'::text
  )$$,
  'save persists the caller and browser keys'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.save_push_subscription('https://push.example/shared', 'key-b', 'auth-b')$$,
  're-registering a shared endpoint succeeds for the current caller'
);
select is(
  (
    select count(*)::integer
    from public.push_subscriptions
    where endpoint = 'https://push.example/shared'
  ),
  1,
  'the new owner can select the one upserted endpoint through RLS'
);
reset role;
select results_eq(
  $$select profile_id, p256dh, auth
    from public.push_subscriptions
    where endpoint = 'https://push.example/shared'$$,
  $$values (
    '10000000-0000-4000-8000-000000000003'::uuid,
    'key-b'::text,
    'auth-b'::text
  )$$,
  'endpoint re-registration replaces both ownership and browser keys'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.push_subscriptions
    where endpoint = 'https://push.example/shared'
  ),
  0,
  'the former owner cannot select the re-registered endpoint'
);
select lives_ok(
  $$select public.delete_push_subscription('https://push.example/shared')$$,
  'deleting an endpoint owned by another profile is an idempotent no-op'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.push_subscriptions
    where endpoint = 'https://push.example/shared'
  ),
  1,
  'one cleaner cannot delete another cleaner subscription'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.delete_push_subscription('https://push.example/shared')$$,
  'the owner can delete the endpoint'
);
select lives_ok(
  $$select public.delete_push_subscription('https://push.example/shared')$$,
  'repeated owner deletion is idempotent'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.push_subscriptions
    where endpoint = 'https://push.example/shared'
  ),
  0,
  'owner deletion removes the subscription'
);

-- The one outbound boundary is notifications -> pg_net with configurable credentials.
select ok(
  exists (
    select 1
    from pg_trigger trigger
    join pg_proc procedure on procedure.oid = trigger.tgfoid
    where trigger.tgrelid = 'public.notifications'::regclass
      and not trigger.tgisinternal
      and pg_get_triggerdef(trigger.oid) ~* 'after insert'
      and pg_get_functiondef(procedure.oid) ~* 'net[.]http_post'
  ),
  'notifications have one AFTER INSERT pg_net dispatch boundary'
);
select is(
  (
    select count(*)::integer
    from pg_trigger trigger
    join pg_proc procedure on procedure.oid = trigger.tgfoid
    where trigger.tgrelid in (
      'public.jobs'::regclass,
      'public.job_assignments'::regclass,
      'public.recurring_assignments'::regclass,
      'public.recurring_assignment_cleaners'::regclass,
      'public.company_members'::regclass,
      'public.profiles'::regclass
    )
      and not trigger.tgisinternal
      and pg_get_functiondef(procedure.oid) ~* '(net[.]http_post|push.dispatch)'
  ),
  0,
  'jobs, assignments, recurrence, memberships, and profiles have no push trigger'
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
  ) ~ 'push_dispatch_url'
    and (
      select pg_get_functiondef(procedure.oid)
      from pg_trigger trigger
      join pg_proc procedure on procedure.oid = trigger.tgfoid
      where trigger.tgrelid = 'public.notifications'::regclass
        and not trigger.tgisinternal
        and pg_get_functiondef(procedure.oid) ~* 'net[.]http_post'
      limit 1
    ) ~ 'push_dispatch_bearer'
    and (
      select pg_get_functiondef(procedure.oid)
      from pg_trigger trigger
      join pg_proc procedure on procedure.oid = trigger.tgfoid
      where trigger.tgrelid = 'public.notifications'::regclass
        and not trigger.tgisinternal
        and pg_get_functiondef(procedure.oid) ~* 'net[.]http_post'
      limit 1
    ) ~* 'exception[[:space:]]+when[[:space:]]+others',
  'dispatch reads configurable URL and bearer settings and catches every enqueue failure'
);

select vault.create_secret(
  'http://kong:8000/functions/v1/push-dispatch',
  'push_dispatch_url'
);
select vault.create_secret('cle-25-local-test-secret', 'push_dispatch_bearer');
delete from net.http_request_queue;

insert into public.jobs (
  id, site_id, service_id, scheduled_start, duration_minutes,
  cleaner_pay_cents, client_charge_cents, status, crew_size, notes
) values
  (
    '25000000-0000-4000-8000-000000000501',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-09-01T08:00:00+10', 60, 9000, 15000, 'posted', 1,
    'CLE-25 internal secret'
  ),
  (
    '25000000-0000-4000-8000-000000000502',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-09-02T08:00:00+10', 60, 9000, 15000, 'draft', 1,
    'CLE-25 internal secret'
  ),
  (
    '25000000-0000-4000-8000-000000000503',
    '10000000-0000-4000-8000-000000000401',
    '30000000-0000-4000-8000-000000000002',
    '2099-09-03T08:00:00+10', 60, 9000, 15000, 'assigned', 2,
    'CLE-25 internal secret'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.assign_job_slot(
      '25000000-0000-4000-8000-000000000501',
      1,
      '10000000-0000-4000-8000-000000000002'
    )$$,
  'assigning a slot succeeds'
);
reset role;
select is(
  (
    select count(*)::integer
    from net.http_request_queue
    where (convert_from(body, 'UTF8')::jsonb ->> 'jobId')
      = '25000000-0000-4000-8000-000000000501'
  ),
  1,
  'assignment enqueues one dispatch request for its one recipient'
);
select results_eq(
  $$select jsonb_object_keys(convert_from(body, 'UTF8')::jsonb)::text collate "C"
    from net.http_request_queue
    where (convert_from(body, 'UTF8')::jsonb ->> 'jobId')
      = '25000000-0000-4000-8000-000000000501'
    order by 1$$,
  $$values
    ('jobId'::text collate "C"),
    ('notificationId'::text collate "C"),
    ('recipientId'::text collate "C"),
    ('type'::text collate "C")$$,
  'the webhook body contains only notification, recipient, job, and type identifiers'
);
select results_eq(
  $$select method::text, url, headers ->> 'Authorization',
           convert_from(body, 'UTF8')::jsonb ->> 'type'
    from net.http_request_queue
    where (convert_from(body, 'UTF8')::jsonb ->> 'jobId')
      = '25000000-0000-4000-8000-000000000501'$$,
  $$values (
    'POST'::text,
    'http://kong:8000/functions/v1/push-dispatch'::text,
    'Bearer cle-25-local-test-secret'::text,
    'job_assigned'::text
  )$$,
  'the queued assignment request uses the configured authenticated endpoint'
);

delete from net.http_request_queue;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.post_job('25000000-0000-4000-8000-000000000502')$$,
  'manually posting a job succeeds'
);
reset role;
select is(
  (
    select count(*)::integer
    from net.http_request_queue
    where (convert_from(body, 'UTF8')::jsonb ->> 'jobId')
      = '25000000-0000-4000-8000-000000000502'
  ),
  (
    select count(*)::integer
    from public.notifications
    where job_id = '25000000-0000-4000-8000-000000000502'
      and type = 'job_posted'
  ),
  'manual post enqueues exactly one request per notified cleaner'
);
select is(
  (
    select count(distinct convert_from(body, 'UTF8')::jsonb ->> 'recipientId')::integer
    from net.http_request_queue
    where (convert_from(body, 'UTF8')::jsonb ->> 'jobId')
      = '25000000-0000-4000-8000-000000000502'
  ),
  (
    select count(*)::integer
    from public.notifications
    where job_id = '25000000-0000-4000-8000-000000000502'
      and type = 'job_posted'
  ),
  'manual post queues each recipient exactly once'
);

insert into public.job_assignments (job_id, slot_number, cleaner_id, source)
values
  (
    '25000000-0000-4000-8000-000000000503', 1,
    '10000000-0000-4000-8000-000000000002', 'manual'
  ),
  (
    '25000000-0000-4000-8000-000000000503', 2,
    '10000000-0000-4000-8000-000000000003', 'manual'
  );
delete from net.http_request_queue;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.cancel_job('25000000-0000-4000-8000-000000000503')$$,
  'cancelling an assigned job succeeds'
);
reset role;
select is(
  (
    select count(*)::integer
    from net.http_request_queue
    where (convert_from(body, 'UTF8')::jsonb ->> 'jobId')
      = '25000000-0000-4000-8000-000000000503'
  ),
  2,
  'cancellation enqueues one request for each of its two recipients'
);
select is(
  (
    select count(distinct convert_from(body, 'UTF8')::jsonb ->> 'recipientId')::integer
    from net.http_request_queue
    where (convert_from(body, 'UTF8')::jsonb ->> 'jobId')
      = '25000000-0000-4000-8000-000000000503'
  ),
  2,
  'cancellation queues each assigned cleaner exactly once'
);

-- Generated assignments and generated postings remain silent.
delete from net.http_request_queue;
delete from public.notifications;
insert into public.recurring_assignments (
  id, site_id, service_id, frequency, weekday, anchor_date,
  local_start_time, duration_minutes, cleaner_pay_cents, crew_size
) values (
  '25000000-0000-4000-8000-000000000701',
  '10000000-0000-4000-8000-000000000403',
  '30000000-0000-4000-8000-000000000001',
  'weekly', 1, '2099-08-03', '06:00', 60, 8000, 2
);
insert into public.recurring_assignment_cleaners (
  recurring_assignment_id, slot_number, cleaner_id
) values (
  '25000000-0000-4000-8000-000000000701',
  1,
  '10000000-0000-4000-8000-000000000004'
);
select ok(
  public.generate_recurring_jobs_at(
    '2099-08-02T14:30:00Z',
    '25000000-0000-4000-8000-000000000701'
  ) > 0,
  'recurring generation creates the expected job instances'
);
select is(
  (
    select count(*)::integer
    from public.notifications
    where job_id in (
      select id
      from public.jobs
      where recurring_assignment_id = '25000000-0000-4000-8000-000000000701'
    )
  ),
  0,
  'recurring generation creates zero notifications'
);
select is(
  (
    select count(*)::integer
    from net.http_request_queue
    where (convert_from(body, 'UTF8')::jsonb ->> 'jobId') in (
      select id::text
      from public.jobs
      where recurring_assignment_id = '25000000-0000-4000-8000-000000000701'
    )
  ),
  0,
  'recurring generation enqueues zero dispatch requests'
);

-- Missing webhook credentials disable dispatch without ever failing the durable insert.
delete from net.http_request_queue;
delete from vault.secrets where name = 'push_dispatch_bearer';
select lives_ok(
  $$insert into public.notifications (recipient_id, job_id, type)
    values (
      '10000000-0000-4000-8000-000000000002',
      '25000000-0000-4000-8000-000000000501',
      'job_assigned'
    )$$,
  'a missing dispatch credential never fails the notification insert'
);
select is(
  (select count(*)::integer from net.http_request_queue),
  0,
  'an unconfigured dispatch boundary safely queues nothing'
);

-- A synchronous pg_net error is swallowed after the enqueue path is entered.
delete from net.http_request_queue;
select vault.create_secret('test-dispatch-secret', 'push_dispatch_bearer');
select vault.update_secret(
  (select id from vault.secrets where name = 'push_dispatch_url'),
  'not-a-url'
);
select lives_ok(
  $$insert into public.notifications (recipient_id, job_id, type)
    values (
      '10000000-0000-4000-8000-000000000002',
      '25000000-0000-4000-8000-000000000501',
      'job_assigned'
    )$$,
  'a synchronous dispatch error never fails the notification insert'
);
select is(
  (select count(*)::integer from net.http_request_queue),
  0,
  'a failed synchronous dispatch leaves no queued request'
);

select * from finish();
rollback;
