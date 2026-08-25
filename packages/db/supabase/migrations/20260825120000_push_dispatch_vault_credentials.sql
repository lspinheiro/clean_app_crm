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
  select nullif(btrim(secret.decrypted_secret), '')
    into dispatch_bearer
  from vault.decrypted_secrets secret
  where secret.name = 'push_dispatch_bearer';

  if dispatch_bearer is null then
    return new;
  end if;

  select nullif(btrim(secret.decrypted_secret), '')
    into dispatch_url
  from vault.decrypted_secrets secret
  where secret.name = 'push_dispatch_url';

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
