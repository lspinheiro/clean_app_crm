create type public.ledger_status as enum ('owed', 'paid');

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  cleaner_id uuid not null references public.profiles (id) on delete restrict,
  job_id uuid not null references public.jobs (id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  status public.ledger_status not null default 'owed',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  payment_note text,
  constraint ledger_entries_job_cleaner_key unique (job_id, cleaner_id),
  constraint ledger_entries_settlement_matches_status check (
    (
      status = 'owed'
      and paid_at is null
      and payment_note is null
    )
    or (
      status = 'paid'
      and paid_at is not null
    )
  )
);

create index ledger_entries_company_status_created_idx
  on public.ledger_entries (company_id, status, created_at desc);
create index ledger_entries_cleaner_status_created_idx
  on public.ledger_entries (cleaner_id, status, created_at desc);

alter table public.notifications
  add column ledger_entry_id uuid references public.ledger_entries (id) on delete restrict,
  add constraint notifications_ledger_matches_type check (
    (
      type = 'payment_marked_paid'
      and ledger_entry_id is not null
    )
    or (
      type <> 'payment_marked_paid'
      and ledger_entry_id is null
    )
  );

create unique index notifications_one_settlement_per_ledger_entry_idx
  on public.notifications (ledger_entry_id)
  where ledger_entry_id is not null;

create function public.record_completed_job_ledger_entries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_entries (
    company_id,
    cleaner_id,
    job_id,
    amount_cents
  )
  select
    client.company_id,
    assignment.cleaner_id,
    new.id,
    new.cleaner_pay_cents
  from public.sites site
  join public.clients client on client.id = site.client_id
  join public.job_assignments assignment on assignment.job_id = new.id
  where site.id = new.site_id
    and assignment.unassigned_at is null
  on conflict (job_id, cleaner_id) do nothing;

  return new;
end;
$$;

create trigger jobs_record_completed_ledger_entries
after update of status on public.jobs
for each row
when (
  new.status = 'completed'
  and old.status is distinct from new.status
)
execute function public.record_completed_job_ledger_entries();

create function public.protect_ledger_entry_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.cleaner_id is distinct from old.cleaner_id
    or new.job_id is distinct from old.job_id
    or new.created_at is distinct from old.created_at then
    raise check_violation using message = 'Ledger entry identity cannot change';
  end if;

  if new.amount_cents is distinct from old.amount_cents then
    raise check_violation using message = 'Ledger entry amount cannot change';
  end if;

  if old.status = 'paid' and new.status = 'owed' then
    raise check_violation using message = 'Paid ledger entries cannot return to owed';
  end if;

  if old.status = 'paid'
    and (
      new.paid_at is distinct from old.paid_at
      or new.payment_note is distinct from old.payment_note
    ) then
    raise check_violation using message = 'Paid ledger entry settlement cannot change';
  end if;

  return new;
end;
$$;

create trigger ledger_entries_protect_history
before update on public.ledger_entries
for each row execute function public.protect_ledger_entry_history();

alter table public.ledger_entries enable row level security;

revoke all on table public.ledger_entries from public, anon, authenticated;
revoke all on table public.ledger_entries from service_role;
grant select, insert on table public.ledger_entries to service_role;

create view public.company_ledger_entries
with (security_invoker = false, security_barrier = true)
as
select
  entry.id as ledger_entry_id,
  entry.company_id,
  entry.cleaner_id,
  cleaner.full_name as cleaner_name,
  entry.job_id,
  job.site_id,
  site.name as site_name,
  job.scheduled_start,
  entry.amount_cents,
  entry.status,
  entry.created_at,
  entry.paid_at,
  entry.payment_note
from public.ledger_entries entry
join public.jobs job on job.id = entry.job_id
join public.sites site on site.id = job.site_id
join public.clients client
  on client.id = site.client_id
  and client.company_id = entry.company_id
join public.profiles cleaner on cleaner.id = entry.cleaner_id
where public.is_company_admin(entry.company_id);

create view public.cleaner_ledger_entries
with (security_invoker = false, security_barrier = true)
as
select
  entry.id as ledger_entry_id,
  entry.company_id,
  company.name as company_name,
  company.logo_path as company_logo_path,
  entry.amount_cents,
  entry.status,
  entry.created_at,
  entry.paid_at
from public.ledger_entries entry
join public.companies company on company.id = entry.company_id
where entry.cleaner_id = auth.uid();

revoke all on table public.company_ledger_entries from public, anon, authenticated;
revoke all on table public.cleaner_ledger_entries from public, anon, authenticated;
grant select on table public.company_ledger_entries to authenticated, service_role;
grant select on table public.cleaner_ledger_entries to authenticated, service_role;

create function public.mark_ledger_paid(
  target_ledger_entry_id uuid,
  target_payment_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_entry public.ledger_entries;
  settlement_time timestamptz;
begin
  select entry.*
  into target_entry
  from public.ledger_entries entry
  join public.jobs job on job.id = entry.job_id
  join public.sites site on site.id = job.site_id
  join public.clients client
    on client.id = site.client_id
    and client.company_id = entry.company_id
  where entry.id = target_ledger_entry_id
  for update of entry;

  if not found or not public.is_company_admin(target_entry.company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if target_entry.status <> 'owed' then
    raise check_violation using message = 'Ledger entry is already paid';
  end if;

  settlement_time := clock_timestamp();

  update public.ledger_entries
  set
    status = 'paid',
    paid_at = settlement_time,
    payment_note = nullif(btrim(target_payment_note), '')
  where id = target_entry.id;

  insert into public.notifications (
    recipient_id,
    job_id,
    type,
    ledger_entry_id
  ) values (
    target_entry.cleaner_id,
    target_entry.job_id,
    'payment_marked_paid',
    target_entry.id
  );
end;
$$;

revoke all on function public.mark_ledger_paid(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_ledger_paid(uuid, text)
  to authenticated, service_role;

revoke all on function public.record_completed_job_ledger_entries()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_ledger_entry_history()
  from public, anon, authenticated, service_role;
