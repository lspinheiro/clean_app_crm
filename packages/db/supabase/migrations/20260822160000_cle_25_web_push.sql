create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_not_blank check (btrim(endpoint) <> ''),
  constraint push_subscriptions_p256dh_not_blank check (btrim(p256dh) <> ''),
  constraint push_subscriptions_auth_not_blank check (btrim(auth) <> '')
);

create index push_subscriptions_profile_id_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_own
on public.push_subscriptions
for select
to authenticated
using (profile_id = auth.uid());

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

create function public.save_push_subscription(
  endpoint text,
  p256dh text,
  auth text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  if endpoint is null or btrim(endpoint) = ''
    or p256dh is null or btrim(p256dh) = ''
    or auth is null or btrim(auth) = '' then
    raise check_violation using message = 'Push subscription details are required';
  end if;

  insert into public.push_subscriptions (
    profile_id,
    endpoint,
    p256dh,
    auth
  ) values (
    caller_id,
    btrim(endpoint),
    btrim(p256dh),
    btrim(auth)
  )
  on conflict on constraint push_subscriptions_endpoint_key do update
  set
    profile_id = excluded.profile_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    created_at = clock_timestamp();
end;
$$;

create function public.delete_push_subscription(target_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  delete from public.push_subscriptions subscription
  where subscription.profile_id = caller_id
    and subscription.endpoint = btrim(target_endpoint);
end;
$$;

revoke all on function public.save_push_subscription(text, text, text)
  from public, anon, authenticated;
revoke all on function public.delete_push_subscription(text)
  from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text)
  to authenticated, service_role;
grant execute on function public.delete_push_subscription(text)
  to authenticated, service_role;

-- The durable notification is authoritative. Push dispatch is intentionally best-effort:
-- absent configuration disables the enqueue and every pg_net error is swallowed so a job
-- mutation never rolls back because an external delivery system is unavailable.
create function public.enqueue_notification_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_url text := coalesce(
    nullif(current_setting('app.settings.push_dispatch_url', true), ''),
    'http://kong:8000/functions/v1/push-dispatch'
  );
  dispatch_bearer text := nullif(
    current_setting('app.settings.push_dispatch_bearer', true),
    ''
  );
begin
  if dispatch_bearer is null then
    return new;
  end if;

  perform net.http_post(
    url := dispatch_url,
    body := jsonb_build_object(
      'notificationId', new.id,
      'recipientId', new.recipient_id,
      'jobId', new.job_id,
      'type', new.type
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || dispatch_bearer
    ),
    timeout_milliseconds := 2000
  );

  return new;
exception when others then
  raise warning 'Push dispatch enqueue failed for notification %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.enqueue_notification_push_dispatch()
  from public, anon, authenticated;

create trigger notifications_enqueue_push_dispatch
after insert on public.notifications
for each row execute function public.enqueue_notification_push_dispatch();
