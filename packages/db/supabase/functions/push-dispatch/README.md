# `push-dispatch`

This Edge Function receives the minimal `notifications` insert webhook,
authenticates its bearer, loads the recipient's subscriptions with the service
role, and sends VAPID-signed Web Push. It delivers only `job_assigned`,
`job_posted`, and `job_cancelled`; every other notification type is a successful
no-op. Payload text is limited to service, site name, suburb, and start time.

## Local setup

Copy `../.env.example` to an untracked local env file and replace every
placeholder. The enqueue trigger reads its credentials from Supabase Vault, so
store the same `PUSH_DISPATCH_SECRET` value there:

```sql
select vault.create_secret('replace-with-the-same-local-secret', 'push_dispatch_bearer');
```

Without that secret the trigger returns early and dispatch stays disabled — the
durable `notifications` row is still written, so nothing breaks.

The trigger defaults the URL to `http://kong:8000/functions/v1/push-dispatch`.
Override it in hosted environments with a second secret:

```sql
select vault.create_secret(
  'https://PROJECT_REF.supabase.co/functions/v1/push-dispatch',
  'push_dispatch_url'
);
```

Use `vault.update_secret(id, new_value)` to rotate either one. Vault rather than
`app.settings.*` GUCs for two reasons: supautils reserves the `app.settings.`
prefix for `supabase_admin`, so `alter database ... set` fails with 42501 for
every role a project can assume; and `pg_db_role_setting.setconfig` is
world-readable, whereas the `vault` schema is denied to `anon` and
`authenticated`.

Serve locally from `packages/db`:

```sh
supabase functions serve push-dispatch --env-file supabase/functions/.env.local
```

The function has custom bearer authentication, so `config.toml` disables gateway
JWT verification for this function. Store the VAPID values and
`PUSH_DISPATCH_SECRET` as Supabase secrets when deploying; never commit the
populated env file.
