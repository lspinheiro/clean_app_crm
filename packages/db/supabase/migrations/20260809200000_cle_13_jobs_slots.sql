create extension if not exists btree_gist with schema extensions;

create type public.job_status as enum (
  'draft',
  'posted',
  'assigned',
  'on_the_way',
  'in_progress',
  'completed',
  'cancelled'
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete restrict,
  service_id uuid not null references public.service_catalogue (id) on delete restrict,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  cleaner_pay_cents integer not null check (cleaner_pay_cents > 0),
  client_charge_cents integer check (client_charge_cents > 0),
  status public.job_status not null default 'draft',
  crew_size integer not null check (crew_size >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);

create table public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  slot_number integer not null check (slot_number >= 1),
  cleaner_id uuid not null references public.profiles (id) on delete restrict,
  assignment_start timestamptz not null,
  assignment_end timestamptz not null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  check (assignment_end > assignment_start),
  check (unassigned_at is null or unassigned_at >= assigned_at)
);

create index jobs_site_start_idx on public.jobs (site_id, scheduled_start);
create index jobs_status_start_idx on public.jobs (status, scheduled_start);
create index job_assignments_job_idx on public.job_assignments (job_id);
create index job_assignments_cleaner_idx on public.job_assignments (cleaner_id);
create unique index job_assignments_active_slot_idx
  on public.job_assignments (job_id, slot_number)
  where unassigned_at is null;
create unique index job_assignments_active_cleaner_job_idx
  on public.job_assignments (job_id, cleaner_id)
  where unassigned_at is null;

alter table public.job_assignments
  add constraint job_assignments_no_cleaner_overlap
  exclude using gist (
    cleaner_id with =,
    tstzrange(assignment_start, assignment_end, '[)') with &&
  )
  where (unassigned_at is null);

create function public.prepare_job_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.crew_size < old.crew_size
    and exists (
      select 1
      from public.job_assignments assignment
      where assignment.job_id = old.id
        and assignment.unassigned_at is null
        and assignment.slot_number > new.crew_size
    ) then
    raise check_violation using message = 'Crew size cannot exclude an active assignment slot';
  end if;

  new.scheduled_end := new.scheduled_start + make_interval(mins => new.duration_minutes);
  return new;
end;
$$;

create trigger jobs_prepare_schedule
before insert or update of scheduled_start, duration_minutes, crew_size
on public.jobs
for each row execute function public.prepare_job_schedule();

create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

create function public.prepare_job_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_job public.jobs;
  target_company_id uuid;
begin
  if tg_op = 'UPDATE' and new.unassigned_at is not null then
    return new;
  end if;

  select job.*
  into target_job
  from public.jobs job
  where job.id = new.job_id
  for update of job;

  if not found then
    raise foreign_key_violation using message = 'Job not found';
  end if;

  if new.slot_number < 1 or new.slot_number > target_job.crew_size then
    raise check_violation using message = 'Crew slot must be between 1 and job crew size';
  end if;

  select client.company_id
  into target_company_id
  from public.sites site
  join public.clients client on client.id = site.client_id
  where site.id = target_job.site_id;

  if not exists (
    select 1
    from public.profiles profile
    join public.company_members membership on membership.profile_id = profile.id
    where profile.id = new.cleaner_id
      and profile.role = 'cleaner'
      and membership.company_id = target_company_id
      and membership.status = 'active'
  ) then
    raise check_violation using message = 'Cleaner must be an active pool member of the job company';
  end if;

  new.assignment_start := target_job.scheduled_start;
  new.assignment_end := target_job.scheduled_end;
  return new;
end;
$$;

create trigger job_assignments_prepare
before insert or update of job_id, slot_number, cleaner_id, unassigned_at
on public.job_assignments
for each row execute function public.prepare_job_assignment();

create function public.sync_job_assignment_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.job_assignments assignment
  set
    assignment_start = new.scheduled_start,
    assignment_end = new.scheduled_end
  where assignment.job_id = new.id
    and assignment.unassigned_at is null;
  return new;
end;
$$;

create trigger jobs_sync_assignment_schedule
after update of scheduled_start, scheduled_end
on public.jobs
for each row
when (
  old.scheduled_start is distinct from new.scheduled_start
  or old.scheduled_end is distinct from new.scheduled_end
)
execute function public.sync_job_assignment_schedule();

alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;

create policy jobs_select_admin
on public.jobs
for select
to authenticated
using (
  exists (
    select 1
    from public.sites site
    join public.clients client on client.id = site.client_id
    where site.id = jobs.site_id
      and public.is_company_admin(client.company_id)
  )
);

create policy job_assignments_select_admin
on public.job_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.jobs job
    join public.sites site on site.id = job.site_id
    join public.clients client on client.id = site.client_id
    where job.id = job_assignments.job_id
      and public.is_company_admin(client.company_id)
  )
);

revoke all on table public.jobs from anon, authenticated;
revoke all on table public.job_assignments from anon, authenticated;
grant select on table public.jobs to authenticated;
grant select on table public.job_assignments to authenticated;
grant all on table public.jobs to service_role;
grant all on table public.job_assignments to service_role;

create view public.vacancies
with (security_invoker = true, security_barrier = true)
as
select
  job.id as job_id,
  client.company_id,
  job.site_id,
  site.client_id,
  site.name as site_name,
  client.name as client_name,
  job.service_id,
  service.name as service_name,
  job.scheduled_start,
  job.duration_minutes,
  job.cleaner_pay_cents,
  job.crew_size,
  slot.slot_number as crew_slot,
  coalesce(
    (
      select array_agg(preference.cleaner_id order by preference.rank)
      from public.site_preferred_cleaners preference
      where preference.site_id = job.site_id
    ),
    array[]::uuid[]
  ) as preferred_cleaner_ids
from public.jobs job
join public.sites site on site.id = job.site_id
join public.clients client on client.id = site.client_id
join public.service_catalogue service on service.id = job.service_id
cross join lateral generate_series(1, job.crew_size) as slot(slot_number)
left join public.job_assignments assignment
  on assignment.job_id = job.id
  and assignment.slot_number = slot.slot_number
  and assignment.unassigned_at is null
where job.status in ('posted', 'assigned')
  and assignment.id is null;

revoke all on table public.vacancies from public, anon, authenticated;
grant select on table public.vacancies to authenticated, service_role;

revoke all on function public.prepare_job_schedule() from public, anon, authenticated;
revoke all on function public.prepare_job_assignment() from public, anon, authenticated;
revoke all on function public.sync_job_assignment_schedule() from public, anon, authenticated;
