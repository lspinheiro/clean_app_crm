# `push-dispatch`

This Edge Function receives the minimal `notifications` insert webhook,
authenticates its bearer, loads the recipient's subscriptions with the service
role, and sends VAPID-signed Web Push. It delivers only `job_assigned`,
`job_posted`, and `job_cancelled`; every other notification type is a successful
no-op. Payload text is limited to service, site name, suburb, and start time.

## Local setup

Copy `../.env.example` to an untracked local env file and replace every
placeholder. Use the same `PUSH_DISPATCH_SECRET` value for the database webhook
setting:

```sql
alter database postgres
  set app.settings.push_dispatch_bearer = 'replace-with-the-same-local-secret';
```

The migration defaults the local URL to
`http://kong:8000/functions/v1/push-dispatch`. Override it in hosted
environments:

```sql
alter database postgres
  set app.settings.push_dispatch_url = 'https://PROJECT_REF.supabase.co/functions/v1/push-dispatch';
```

Reconnect database clients after changing database settings. Serve locally from
`packages/db`:

```sh
supabase functions serve push-dispatch --env-file supabase/functions/.env.local
```

The function has custom bearer authentication, so `config.toml` disables gateway
JWT verification for this function. Store the VAPID values and
`PUSH_DISPATCH_SECRET` as Supabase secrets when deploying; never commit the
populated env file.
