create table public.pool_invite_email_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invite_id uuid not null references public.company_invites(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  locale public.app_locale not null,
  confirmation_key uuid not null,
  authority_confirmed_at timestamptz not null,
  current_attempt integer not null default 0 check (current_attempt >= 0),
  last_retry_key uuid,
  created_at timestamptz not null default now(),
  unique (company_id, confirmation_key)
);

create table public.pool_invite_email_recipients (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.pool_invite_email_batches(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  name text check (name is null or char_length(name) between 1 and 200),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'failed')),
  attempt_number integer not null default 0 check (attempt_number >= 0),
  provider_message_id text,
  failure_reason text check (
    failure_reason is null
    or failure_reason in (
      'provider_invalid_response',
      'provider_rejected',
      'provider_unavailable'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index pool_invite_email_recipients_batch_email_key
on public.pool_invite_email_recipients (batch_id, lower(email));

create trigger set_pool_invite_email_recipients_updated_at
before update on public.pool_invite_email_recipients
for each row execute function public.set_updated_at();

alter table public.pool_invite_email_batches enable row level security;
alter table public.pool_invite_email_recipients enable row level security;

create policy pool_invite_email_batches_select_admin
on public.pool_invite_email_batches
for select
to authenticated
using (public.is_company_admin(company_id));

create policy pool_invite_email_recipients_select_admin
on public.pool_invite_email_recipients
for select
to authenticated
using (
  exists (
    select 1
    from public.pool_invite_email_batches batch
    where batch.id = pool_invite_email_recipients.batch_id
      and public.is_company_admin(batch.company_id)
  )
);

create or replace function public.prepare_pool_invite_email_batch(
  target_company_id uuid,
  selected_invite_id uuid,
  selected_locale public.app_locale,
  confirmation_key uuid,
  authority_confirmed boolean,
  recipients jsonb
)
returns table (
  batch_id uuid,
  attempt_number integer,
  locale public.app_locale,
  invite_code text,
  recipient_id uuid,
  email text,
  name text,
  status text,
  provider_message_id text,
  failure_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_id_value uuid;
  batch_attempt_value integer;
  batch_invite_id_value uuid;
  batch_locale_value public.app_locale;
  invite_code_value text;
  invite_revoked_at timestamptz;
  invite_expires_at timestamptz;
  recipient jsonb;
  recipient_email text;
  recipient_name text;
  created_batch boolean := false;
begin
  perform 1
  from public.companies company
  where company.id = target_company_id
  for update;

  if not found or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if authority_confirmed is distinct from true then
    raise invalid_parameter_value using message = 'Recipient authority confirmation is required';
  end if;

  if jsonb_typeof(recipients) is distinct from 'array'
    or jsonb_array_length(recipients) = 0 then
    raise invalid_parameter_value using message = 'At least one email recipient is required';
  end if;

  if jsonb_array_length(recipients) > 500 then
    raise invalid_parameter_value using message = 'A maximum of 500 email recipients is allowed';
  end if;

  select invite.code, invite.revoked_at, invite.expires_at
  into invite_code_value, invite_revoked_at, invite_expires_at
  from public.company_invites invite
  where invite.id = selected_invite_id
    and invite.company_id = target_company_id
  for share;

  if not found then
    raise invalid_parameter_value using message = 'Invite does not belong to this company';
  end if;
  if invite_revoked_at is not null
    or (invite_expires_at is not null and invite_expires_at <= now()) then
    raise invalid_parameter_value using message = 'Invite is no longer active';
  end if;

  insert into public.pool_invite_email_batches (
    company_id,
    invite_id,
    requested_by,
    locale,
    confirmation_key,
    authority_confirmed_at
  ) values (
    target_company_id,
    selected_invite_id,
    auth.uid(),
    selected_locale,
    confirmation_key,
    now()
  )
  on conflict on constraint pool_invite_email_batches_company_id_confirmation_key_key
  do nothing
  returning id, current_attempt
  into batch_id_value, batch_attempt_value;

  if found then
    created_batch := true;
  else
    select batch.id, batch.current_attempt, batch.invite_id, batch.locale
    into batch_id_value, batch_attempt_value, batch_invite_id_value, batch_locale_value
    from public.pool_invite_email_batches batch
    where batch.company_id = target_company_id
      and batch.confirmation_key = prepare_pool_invite_email_batch.confirmation_key;

    if batch_invite_id_value is distinct from selected_invite_id
      or batch_locale_value is distinct from selected_locale then
      raise invalid_parameter_value using message = 'Confirmation key already belongs to another email batch';
    end if;
  end if;

  if created_batch then
    for recipient in select value from jsonb_array_elements(recipients)
    loop
      if jsonb_typeof(recipient) is distinct from 'object' then
        raise invalid_parameter_value using message = 'Email recipients are invalid';
      end if;
      recipient_email := lower(btrim(coalesce(recipient ->> 'email', '')));
      recipient_name := nullif(btrim(coalesce(recipient ->> 'name', '')), '');
      if recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        or char_length(recipient_email) > 320
        or (recipient_name is not null and char_length(recipient_name) > 200) then
        raise invalid_parameter_value using message = 'Email recipients are invalid';
      end if;

      insert into public.pool_invite_email_recipients (
        batch_id,
        email,
        name,
        attempt_number
      ) values (
        batch_id_value,
        recipient_email,
        recipient_name,
        batch_attempt_value
      )
      on conflict do nothing;
    end loop;
  end if;

  return query
  select
    batch.id,
    batch.current_attempt,
    batch.locale,
    invite_code_value,
    batch_recipient.id,
    batch_recipient.email,
    batch_recipient.name,
    batch_recipient.status,
    batch_recipient.provider_message_id,
    batch_recipient.failure_reason
  from public.pool_invite_email_batches batch
  join public.pool_invite_email_recipients batch_recipient
    on batch_recipient.batch_id = batch.id
  where batch.id = batch_id_value
  order by lower(batch_recipient.email);
end;
$$;

create function public.prepare_pool_invite_email_retry(
  selected_batch_id uuid,
  retry_key uuid
)
returns table (
  batch_id uuid,
  attempt_number integer,
  locale public.app_locale,
  invite_code text,
  recipient_id uuid,
  email text,
  name text,
  status text,
  provider_message_id text,
  failure_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_batch public.pool_invite_email_batches;
  invite_code_value text;
  invite_revoked_at timestamptz;
  invite_expires_at timestamptz;
  failed_count integer;
begin
  select batch.*
  into target_batch
  from public.pool_invite_email_batches batch
  where batch.id = selected_batch_id
  for update;

  if not found or not public.is_company_admin(target_batch.company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  select invite.code, invite.revoked_at, invite.expires_at
  into invite_code_value, invite_revoked_at, invite_expires_at
  from public.company_invites invite
  where invite.id = target_batch.invite_id
  for share;

  if invite_revoked_at is not null
    or (invite_expires_at is not null and invite_expires_at <= now()) then
    raise invalid_parameter_value using message = 'Invite is no longer active';
  end if;

  if target_batch.last_retry_key is distinct from retry_key then
    select count(*)::integer
    into failed_count
    from public.pool_invite_email_recipients batch_recipient
    where batch_recipient.batch_id = selected_batch_id
      and batch_recipient.status = 'failed';

    if failed_count > 0 then
      update public.pool_invite_email_batches batch
      set
        current_attempt = batch.current_attempt + 1,
        last_retry_key = retry_key
      where batch.id = selected_batch_id
      returning batch.current_attempt into target_batch.current_attempt;

      update public.pool_invite_email_recipients batch_recipient
      set
        status = 'pending',
        attempt_number = target_batch.current_attempt,
        provider_message_id = null,
        failure_reason = null
      where batch_recipient.batch_id = selected_batch_id
        and batch_recipient.status = 'failed';
    end if;
  end if;

  return query
  select
    batch.id,
    batch.current_attempt,
    batch.locale,
    invite_code_value,
    batch_recipient.id,
    batch_recipient.email,
    batch_recipient.name,
    batch_recipient.status,
    batch_recipient.provider_message_id,
    batch_recipient.failure_reason
  from public.pool_invite_email_batches batch
  join public.pool_invite_email_recipients batch_recipient
    on batch_recipient.batch_id = batch.id
  where batch.id = selected_batch_id
  order by lower(batch_recipient.email);
end;
$$;

create or replace function public.record_pool_invite_email_results(
  selected_batch_id uuid,
  attempt_number integer,
  provider_results jsonb
)
returns table (
  recipient_id uuid,
  email text,
  name text,
  status text,
  provider_message_id text,
  failure_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  provider_result jsonb;
  result_recipient_id uuid;
  result_status text;
  result_message_id text;
  result_failure_reason text;
begin
  select batch.company_id
  into target_company_id
  from public.pool_invite_email_batches batch
  where batch.id = selected_batch_id
    and batch.current_attempt = record_pool_invite_email_results.attempt_number
  for share;

  if not found or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if jsonb_typeof(provider_results) is distinct from 'array' then
    raise invalid_parameter_value using message = 'Provider results are invalid';
  end if;

  for provider_result in select value from jsonb_array_elements(provider_results)
  loop
    result_recipient_id := (provider_result ->> 'recipient_id')::uuid;
    result_status := provider_result ->> 'status';
    result_message_id := nullif(btrim(coalesce(provider_result ->> 'provider_message_id', '')), '');
    result_failure_reason := nullif(btrim(coalesce(provider_result ->> 'failure_reason', '')), '');

    if result_status is null
      or result_status not in ('accepted', 'failed')
      or (result_status = 'accepted' and result_message_id is null)
      or (
        result_status = 'failed'
        and (
          result_failure_reason is null
          or result_failure_reason not in (
            'provider_invalid_response',
            'provider_rejected',
            'provider_unavailable'
          )
        )
      ) then
      raise invalid_parameter_value using message = 'Provider results are invalid';
    end if;

    update public.pool_invite_email_recipients batch_recipient
    set
      status = result_status,
      provider_message_id = case when result_status = 'accepted' then result_message_id end,
      failure_reason = case when result_status = 'failed' then result_failure_reason end
    where batch_recipient.id = result_recipient_id
      and batch_recipient.batch_id = selected_batch_id
      and batch_recipient.attempt_number = record_pool_invite_email_results.attempt_number
      and batch_recipient.status = 'pending';
  end loop;

  return query
  select
    batch_recipient.id,
    batch_recipient.email,
    batch_recipient.name,
    batch_recipient.status,
    batch_recipient.provider_message_id,
    batch_recipient.failure_reason
  from public.pool_invite_email_recipients batch_recipient
  where batch_recipient.batch_id = selected_batch_id
  order by lower(batch_recipient.email);
end;
$$;

revoke all on table public.pool_invite_email_batches from public, anon, authenticated;
revoke all on table public.pool_invite_email_recipients from public, anon, authenticated;
grant select on table public.pool_invite_email_batches to authenticated;
grant select on table public.pool_invite_email_recipients to authenticated;
grant all on table public.pool_invite_email_batches to service_role;
grant all on table public.pool_invite_email_recipients to service_role;

revoke all on function public.prepare_pool_invite_email_batch(
  uuid, uuid, public.app_locale, uuid, boolean, jsonb
) from public, anon;
revoke all on function public.prepare_pool_invite_email_retry(uuid, uuid) from public, anon;
revoke all on function public.record_pool_invite_email_results(uuid, integer, jsonb) from public, anon;
grant execute on function public.prepare_pool_invite_email_batch(
  uuid, uuid, public.app_locale, uuid, boolean, jsonb
) to authenticated, service_role;
grant execute on function public.prepare_pool_invite_email_retry(uuid, uuid)
to authenticated, service_role;
grant execute on function public.record_pool_invite_email_results(uuid, integer, jsonb)
to authenticated, service_role;
