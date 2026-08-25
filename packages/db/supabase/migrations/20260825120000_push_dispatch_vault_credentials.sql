-- CLE-25 shipped its push dispatch credentials as `app.settings.*` GUCs, which no role a
-- Supabase deployment can assume is permitted to set: supautils reserves the prefix for
-- `supabase_admin`, so `alter database postgres set app.settings.push_dispatch_bearer`
-- fails with 42501 for `postgres` on both the local image and hosted projects. The bearer
-- was therefore always null and the trigger returned early on every insert — push dispatch
-- has never fired outside a test transaction, where `set_config(..., true)` is permitted.
--
-- Supabase Vault is writable by `postgres`, readable by this security-definer function,
-- and denied to `anon`/`authenticated` (permission denied for schema vault). That last
-- property matters: `pg_db_role_setting.setconfig` is world-readable, so a GUC would have
-- exposed the shared webhook secret to every signed-in user.
--
-- Store the credentials with:
--   select vault.create_secret('<shared-secret>', 'push_dispatch_bearer');
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-dispatch',
--                              'push_dispatch_url');

create extension if not exists supabase_vault with schema vault;

create or replace function public.enqueue_notification_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_bearer text;
  dispatch_url text;
begin
  -- One scan, so a fan-out inserting N notifications pays N AEAD decrypts, not 2N.
  select
    max(nullif(btrim(secret.decrypted_secret), ''))
      filter (where secret.name = 'push_dispatch_bearer'),
    max(nullif(btrim(secret.decrypted_secret), ''))
      filter (where secret.name = 'push_dispatch_url')
    into dispatch_bearer, dispatch_url
  from vault.decrypted_secrets secret
  where secret.name in ('push_dispatch_bearer', 'push_dispatch_url');

  if dispatch_bearer is null then
    return new;
  end if;

  perform net.http_post(
    url := coalesce(dispatch_url, 'http://kong:8000/functions/v1/push-dispatch'),
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

-- Residual exposure, deliberately not "fixed" here: pg_net ships `net.http_request_queue`
-- and `net._http_response` granted to PUBLIC with no RLS, so a dispatch row transiently
-- carries the bearer where the `anon` and `authenticated` roles can read it. It cannot be
-- revoked from a migration — those tables are owned by `supabase_admin`, `postgres` holds
-- no grant option on them, and REVOKE therefore reports success while changing nothing.
-- What bounds it is PostgREST: `config.toml` exposes only `public` and `graphql_public`,
-- so `/rest/v1/http_request_queue` is a 404 and no cleaner can reach those roles' SQL.
-- Adding `net` to the exposed schemas would publish the webhook secret — see CLE-27
-- follow-up before changing `[api].schemas`.
