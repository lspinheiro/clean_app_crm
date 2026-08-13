create type public.application_status as enum (
  'applied',
  'assigned',
  'not_selected',
  'withdrawn'
);

create type public.notification_type as enum (
  'job_assigned',
  'job_posted',
  'job_cancelled'
);

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  cleaner_id uuid not null references public.profiles (id) on delete cascade,
  status public.application_status not null default 'applied',
  applied_at timestamptz not null default now(),
  resolved_at timestamptz,
  withdrawn_at timestamptz,
  constraint job_applications_job_cleaner_key unique (job_id, cleaner_id),
  constraint job_applications_resolution_matches_status check (
    (
      status = 'applied'
      and resolved_at is null
      and withdrawn_at is null
    )
    or (
      status in ('assigned', 'not_selected')
      and resolved_at is not null
      and withdrawn_at is null
    )
    or (
      status = 'withdrawn'
      and resolved_at is not null
      and withdrawn_at is not null
    )
  )
);

create index job_applications_job_status_idx
  on public.job_applications (job_id, status);
create index job_applications_cleaner_status_idx
  on public.job_applications (cleaner_id, status);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  type public.notification_type not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_job_idx on public.notifications (job_id);

-- Address and access-note disclosure is a write-audited operation. PostgREST runs
-- ordinary view GETs in read-only transactions, so the safe list view below omits
-- these fields and get_cleaner_job_access() records each disclosure before returning
-- them. Cleaners never receive direct access to this append-only audit table.
create table public.site_access_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  assignment_id uuid not null references public.job_assignments (id) on delete cascade,
  cleaner_id uuid not null references public.profiles (id) on delete cascade,
  accessed_at timestamptz not null default now()
);

create index site_access_log_job_cleaner_idx
  on public.site_access_log (job_id, cleaner_id, accessed_at desc);

-- Applying to a generated instance is an operational reliance on its advertised
-- schedule and pay. Protect that instance from silent rule reconciliation in the
-- same way CLE-15 already protects manual assignment edits.
create function public.mark_generated_job_application_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.recurring_generation', true), '') <> 'on' then
    update public.jobs
    set manually_edited_at = coalesce(manually_edited_at, clock_timestamp())
    where id = new.job_id
      and recurring_assignment_id is not null;
  end if;

  return new;
end;
$$;

create trigger job_applications_mark_generated_manual_edit
before insert on public.job_applications
for each row execute function public.mark_generated_job_application_edit();

-- Every cancellation path, including rule reconciliation and trusted service
-- writes, must close the cleaner's waiting state. This trigger deliberately
-- creates no notification; only cancel_job() owns manual cancellation delivery.
create function public.resolve_cancelled_job_applications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.job_applications
  set
    status = 'not_selected',
    resolved_at = clock_timestamp()
  where job_id = new.id
    and status = 'applied';

  return new;
end;
$$;

create trigger jobs_resolve_cancelled_applications
after update of status on public.jobs
for each row
when (new.status = 'cancelled' and old.status is distinct from new.status)
execute function public.resolve_cancelled_job_applications();

-- Removing pool eligibility releases pre-work slots and waiting state. Existing
-- CLE-15 lifecycle reconciliation owns untouched recurring slots; this helper
-- also catches recurring slots on application-touched jobs that reconciliation
-- deliberately preserves.
-- Already-started assignments remain active and are grandfathered by the gated
-- cleaner reads/status RPCs below so a running job cannot be silently stranded.
create function public.release_cleaner_loop_state(
  target_company_id uuid,
  target_cleaner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job_id uuid;
  release_time timestamptz;
begin
  for target_job_id in
    select job.id
    from public.jobs job
    join public.sites site on site.id = job.site_id
    join public.clients client on client.id = site.client_id
    where job.status in ('draft', 'posted', 'assigned')
      and (
        target_company_id is null
        or client.company_id = target_company_id
      )
      and (
        exists (
          select 1
          from public.job_assignments assignment
            where assignment.job_id = job.id
            and assignment.cleaner_id = target_cleaner_id
            and assignment.unassigned_at is null
        )
        or exists (
          select 1
          from public.job_applications application
          where application.job_id = job.id
            and application.cleaner_id = target_cleaner_id
            and application.status in ('applied', 'assigned')
        )
      )
    order by job.id
  loop
    perform 1
    from public.jobs
    where id = target_job_id
    for update;

    release_time := clock_timestamp();

    update public.job_assignments
    set unassigned_at = release_time
    where job_id = target_job_id
      and cleaner_id = target_cleaner_id
      and unassigned_at is null;

    update public.job_applications
    set
      status = 'not_selected',
      resolved_at = coalesce(resolved_at, release_time),
      withdrawn_at = null
    where job_id = target_job_id
      and cleaner_id = target_cleaner_id
      and status in ('applied', 'assigned');

    update public.jobs job
    set status = 'posted'
    where job.id = target_job_id
      and job.status = 'assigned'
      and (
        select count(*)
        from public.job_assignments assignment
        where assignment.job_id = job.id
          and assignment.unassigned_at is null
      ) < job.crew_size;
  end loop;
end;
$$;

create or replace function public.open_recurring_slots_for_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rule_id uuid;
begin
  if tg_op = 'DELETE'
    or (
      old.status = 'active'
      and (
        new.status <> 'active'
        or new.company_id is distinct from old.company_id
        or new.profile_id is distinct from old.profile_id
      )
    ) then
    for affected_rule_id in
      with removed_named_slots as (
        delete from public.recurring_assignment_cleaners named
        using public.recurring_assignments rule, public.sites site, public.clients client
        where named.recurring_assignment_id = rule.id
          and rule.site_id = site.id
          and site.client_id = client.id
          and client.company_id = old.company_id
          and named.cleaner_id = old.profile_id
        returning named.recurring_assignment_id
      )
      select distinct recurring_assignment_id
      from removed_named_slots
      order by recurring_assignment_id
    loop
      perform public.compact_recurring_assignment_cleaners(affected_rule_id);
      update public.recurring_assignments
      set generation_version = generation_version + 1
      where id = affected_rule_id;
      perform public.generate_recurring_jobs_at(clock_timestamp(), affected_rule_id);
    end loop;

    perform public.release_cleaner_loop_state(old.company_id, old.profile_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.open_recurring_slots_for_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rule_id uuid;
begin
  if tg_op = 'DELETE'
    or (old.role = 'cleaner' and new.role <> 'cleaner') then
    for affected_rule_id in
      with removed_named_slots as (
        delete from public.recurring_assignment_cleaners named
        where named.cleaner_id = old.id
        returning named.recurring_assignment_id
      )
      select distinct recurring_assignment_id
      from removed_named_slots
      order by recurring_assignment_id
    loop
      perform public.compact_recurring_assignment_cleaners(affected_rule_id);
      update public.recurring_assignments
      set generation_version = generation_version + 1
      where id = affected_rule_id;
      perform public.generate_recurring_jobs_at(clock_timestamp(), affected_rule_id);
    end loop;

    perform public.release_cleaner_loop_state(null, old.id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter table public.job_applications enable row level security;
alter table public.notifications enable row level security;
alter table public.site_access_log enable row level security;

create policy job_applications_select_participant
on public.job_applications
for select
to authenticated
using (
  cleaner_id = auth.uid()
  or exists (
    select 1
    from public.jobs job
    join public.sites site on site.id = job.site_id
    join public.clients client on client.id = site.client_id
    where job.id = job_applications.job_id
      and public.is_company_admin(client.company_id)
  )
);

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (recipient_id = auth.uid());

create policy notifications_update_own
on public.notifications
for update
to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

revoke all on table public.job_applications from public, anon, authenticated;
revoke all on table public.notifications from public, anon, authenticated;
revoke all on table public.site_access_log from public, anon, authenticated;
grant select on table public.job_applications to authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant all on table public.job_applications to service_role;
grant all on table public.notifications to service_role;
grant all on table public.site_access_log to service_role;

create view public.cleaner_job_board
with (security_invoker = false, security_barrier = true)
as
select
  job.id as job_id,
  client.company_id,
  company.name as company_name,
  company.logo_path as company_logo_path,
  site.name as site_name,
  site.suburb,
  job.service_id,
  service.name as service_name,
  job.scheduled_start,
  job.duration_minutes,
  job.cleaner_pay_cents,
  job.crew_size,
  slot.slot_number as crew_slot,
  application.status as my_application_status
from public.jobs job
join public.sites site on site.id = job.site_id
join public.clients client on client.id = site.client_id
join public.companies company on company.id = client.company_id
join public.service_catalogue service on service.id = job.service_id
cross join lateral generate_series(1, job.crew_size) as slot(slot_number)
left join public.job_assignments assignment
  on assignment.job_id = job.id
  and assignment.slot_number = slot.slot_number
  and assignment.unassigned_at is null
left join public.job_applications application
  on application.job_id = job.id
  and application.cleaner_id = auth.uid()
where job.status = 'posted'
  and assignment.id is null
  and company.status = 'approved'
  and exists (
    select 1
    from public.profiles profile
    join public.company_members membership
      on membership.profile_id = profile.id
    where profile.id = auth.uid()
      and profile.role = 'cleaner'
      and membership.company_id = client.company_id
      and membership.status = 'active'
  )
  and not exists (
    select 1
    from public.job_assignments own_assignment
    where own_assignment.job_id = job.id
      and own_assignment.cleaner_id = auth.uid()
      and own_assignment.unassigned_at is null
  );

create view public.cleaner_my_jobs
with (security_invoker = false, security_barrier = true)
as
select
  assignment.id as assignment_id,
  assignment.job_id,
  assignment.slot_number,
  client.company_id,
  company.name as company_name,
  company.logo_path as company_logo_path,
  site.name as site_name,
  site.suburb,
  job.service_id,
  service.name as service_name,
  job.status,
  job.scheduled_start,
  job.duration_minutes,
  job.cleaner_pay_cents,
  assignment.assigned_at
from public.job_assignments assignment
join public.jobs job on job.id = assignment.job_id
join public.sites site on site.id = job.site_id
join public.clients client on client.id = site.client_id
join public.companies company on company.id = client.company_id
join public.service_catalogue service on service.id = job.service_id
where assignment.cleaner_id = auth.uid()
  and assignment.unassigned_at is null
  and job.status in ('draft', 'posted', 'assigned', 'on_the_way', 'in_progress')
  and company.status = 'approved'
  and (
    job.status in ('on_the_way', 'in_progress')
    or exists (
      select 1
      from public.profiles profile
      join public.company_members membership
        on membership.profile_id = profile.id
      where profile.id = auth.uid()
        and profile.role = 'cleaner'
        and membership.company_id = client.company_id
        and membership.status = 'active'
    )
  );

revoke all on table public.cleaner_job_board from public, anon, authenticated;
revoke all on table public.cleaner_my_jobs from public, anon, authenticated;
grant select on table public.cleaner_job_board to authenticated, service_role;
grant select on table public.cleaner_my_jobs to authenticated, service_role;

create function public.apply_to_job(target_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_job public.jobs;
  expected_company_id uuid;
  target_company_id uuid;
  application_id uuid;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Job is not available';
  end if;

  select client.company_id
  into expected_company_id
  from public.jobs job
  join public.sites site on site.id = job.site_id
  join public.clients client on client.id = site.client_id
  where job.id = target_job_id;

  if not found then
    raise insufficient_privilege using message = 'Job is not available';
  end if;

  perform 1
  from public.profiles profile
  join public.company_members membership
    on membership.profile_id = profile.id
  where profile.id = caller_id
    and profile.role = 'cleaner'
    and membership.company_id = expected_company_id
    and membership.status = 'active'
  for share of profile, membership;

  if not found then
    raise insufficient_privilege using message = 'Job is not available';
  end if;

  select job.*
  into target_job
  from public.jobs job
  where job.id = target_job_id
  for update of job;

  if not found then
    raise insufficient_privilege using message = 'Job is not available';
  end if;

  select client.company_id
  into target_company_id
  from public.sites site
  join public.clients client on client.id = site.client_id
  where site.id = target_job.site_id;

  if target_company_id is distinct from expected_company_id then
    raise insufficient_privilege using message = 'Job is not available';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    join public.company_members membership
      on membership.profile_id = profile.id
    join public.companies company on company.id = membership.company_id
    where profile.id = caller_id
      and profile.role = 'cleaner'
      and membership.company_id = target_company_id
      and membership.status = 'active'
      and company.status = 'approved'
  ) then
    raise insufficient_privilege using message = 'Job is not available';
  end if;

  if target_job.status <> 'posted'
    or (
      select count(*)
      from public.job_assignments assignment
      where assignment.job_id = target_job.id
        and assignment.unassigned_at is null
    ) >= target_job.crew_size then
    raise check_violation using message = 'Job has no open slots';
  end if;

  if exists (
    select 1
    from public.job_applications application
    where application.job_id = target_job.id
      and application.cleaner_id = caller_id
  ) then
    raise unique_violation using message = 'Cleaner can apply only once per job';
  end if;

  if exists (
    select 1
    from public.job_assignments assignment
    where assignment.job_id = target_job.id
      and assignment.cleaner_id = caller_id
      and assignment.unassigned_at is null
  ) then
    raise check_violation using message = 'Cleaner is already assigned to this job';
  end if;

  insert into public.job_applications (job_id, cleaner_id)
  values (target_job.id, caller_id)
  returning id into application_id;

  return application_id;
end;
$$;

create function public.withdraw_application(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  resolution_time timestamptz;
begin
  perform 1
  from public.jobs job
  where job.id = target_job_id
  for update;

  if caller_id is null or not found then
    raise insufficient_privilege using message = 'Active application not found';
  end if;

  resolution_time := clock_timestamp();

  update public.job_applications application
  set
    status = 'withdrawn',
    resolved_at = resolution_time,
    withdrawn_at = resolution_time
  where application.job_id = target_job_id
    and application.cleaner_id = caller_id
    and application.status = 'applied';

  if not found then
    raise insufficient_privilege using message = 'Active application not found';
  end if;
end;
$$;

create function public.post_job(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.jobs;
  target_company_id uuid;
begin
  select job.*
  into target_job
  from public.jobs job
  where job.id = target_job_id
  for update of job;

  if not found then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  select client.company_id
  into target_company_id
  from public.sites site
  join public.clients client on client.id = site.client_id
  where site.id = target_job.site_id;

  if not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if target_job.status <> 'draft' then
    raise check_violation using message = 'Only draft jobs can be posted';
  end if;

  update public.jobs
  set status = 'posted'
  where id = target_job.id;

  insert into public.notifications (recipient_id, job_id, type)
  select membership.profile_id, target_job.id, 'job_posted'
  from public.company_members membership
  join public.profiles profile on profile.id = membership.profile_id
  join public.companies company on company.id = membership.company_id
  where membership.company_id = target_company_id
    and membership.status = 'active'
    and profile.role = 'cleaner'
    and company.status = 'approved'
    and not exists (
      select 1
      from public.job_assignments assignment
      where assignment.job_id = target_job.id
        and assignment.cleaner_id = membership.profile_id
        and assignment.unassigned_at is null
    );
end;
$$;

create function public.assign_job_slot(
  target_job_id uuid,
  target_slot_number integer,
  target_cleaner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.jobs;
  expected_company_id uuid;
  target_company_id uuid;
  assignment_id uuid;
  active_assignment_count integer;
  resolution_time timestamptz;
begin
  select client.company_id
  into expected_company_id
  from public.jobs job
  join public.sites site on site.id = job.site_id
  join public.clients client on client.id = site.client_id
  where job.id = target_job_id;

  if not found then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if not public.is_company_admin(expected_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  perform 1
  from public.profiles profile
  join public.company_members membership
    on membership.profile_id = profile.id
  where profile.id = target_cleaner_id
    and profile.role = 'cleaner'
    and membership.company_id = expected_company_id
    and membership.status = 'active'
  for share of profile, membership;

  if not found then
    raise check_violation using message = 'Cleaner is not an active pool member';
  end if;

  select job.*
  into target_job
  from public.jobs job
  where job.id = target_job_id
  for update of job;

  if not found then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  select client.company_id
  into target_company_id
  from public.sites site
  join public.clients client on client.id = site.client_id
  where site.id = target_job.site_id;

  if target_company_id is distinct from expected_company_id then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if target_job.status not in ('draft', 'posted') then
    raise check_violation using message = 'Job is not open for assignment';
  end if;

  if target_slot_number < 1 or target_slot_number > target_job.crew_size then
    raise check_violation using message = 'Crew slot is outside the job crew size';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    join public.company_members membership
      on membership.profile_id = profile.id
    where profile.id = target_cleaner_id
      and profile.role = 'cleaner'
      and membership.company_id = target_company_id
      and membership.status = 'active'
  ) then
    raise check_violation using message = 'Cleaner is not an active pool member';
  end if;

  if exists (
    select 1
    from public.job_applications application
    where application.job_id = target_job.id
      and application.cleaner_id = target_cleaner_id
      and application.status = 'withdrawn'
  ) then
    raise check_violation using message = 'Withdrawn cleaner cannot be assigned to this job';
  end if;

  if exists (
    select 1
    from public.job_assignments assignment
    where assignment.job_id = target_job.id
      and assignment.slot_number = target_slot_number
      and assignment.unassigned_at is null
  ) then
    raise unique_violation using message = 'Crew slot is already assigned';
  end if;

  if exists (
    select 1
    from public.job_assignments assignment
    where assignment.job_id = target_job.id
      and assignment.cleaner_id = target_cleaner_id
      and assignment.unassigned_at is null
  ) then
    raise unique_violation using message = 'Cleaner already has a slot on this job';
  end if;

  begin
    insert into public.job_assignments (
      job_id,
      slot_number,
      cleaner_id,
      source
    ) values (
      target_job.id,
      target_slot_number,
      target_cleaner_id,
      'manual'
    )
    returning id into assignment_id;
  exception when exclusion_violation then
    raise check_violation using
      message = 'Cleaner is unavailable for this time';
  end;

  resolution_time := clock_timestamp();

  update public.job_applications application
  set
    status = 'assigned',
    resolved_at = resolution_time
  where application.job_id = target_job.id
    and application.cleaner_id = target_cleaner_id
    and application.status in ('applied', 'not_selected');

  insert into public.notifications (recipient_id, job_id, type)
  values (target_cleaner_id, target_job.id, 'job_assigned');

  select count(*)::integer
  into active_assignment_count
  from public.job_assignments assignment
  where assignment.job_id = target_job.id
    and assignment.unassigned_at is null;

  if active_assignment_count = target_job.crew_size then
    update public.jobs
    set status = 'assigned'
    where id = target_job.id;

    update public.job_applications application
    set
      status = 'not_selected',
      resolved_at = resolution_time
    where application.job_id = target_job.id
      and application.status = 'applied';
  end if;

  return assignment_id;
end;
$$;

create function public.update_job_status(
  target_job_id uuid,
  target_new_status public.job_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_job public.jobs;
begin
  select job.*
  into target_job
  from public.jobs job
  where job.id = target_job_id
  for update of job;

  if caller_id is null or not found or not exists (
    select 1
    from public.job_assignments assignment
    join public.sites site on site.id = target_job.site_id
    join public.clients client on client.id = site.client_id
    join public.companies company on company.id = client.company_id
    where assignment.job_id = target_job.id
      and assignment.cleaner_id = caller_id
      and assignment.unassigned_at is null
      and company.status = 'approved'
      and (
        target_job.status in ('on_the_way', 'in_progress')
        or exists (
          select 1
          from public.profiles profile
          join public.company_members membership
            on membership.profile_id = profile.id
          where profile.id = caller_id
            and profile.role = 'cleaner'
            and membership.company_id = client.company_id
            and membership.status = 'active'
        )
      )
  ) then
    raise insufficient_privilege using message = 'Assigned cleaner access required';
  end if;

  if not (
    (target_job.status = 'assigned' and target_new_status = 'on_the_way')
    or (target_job.status = 'on_the_way' and target_new_status = 'in_progress')
    or (target_job.status = 'in_progress' and target_new_status = 'completed')
  ) then
    raise check_violation using message = 'Invalid job status transition';
  end if;

  update public.jobs
  set status = target_new_status
  where id = target_job.id;
end;
$$;

create function public.cancel_job(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.jobs;
  target_company_id uuid;
  assigned_cleaner_ids uuid[];
  resolution_time timestamptz;
begin
  select job.*
  into target_job
  from public.jobs job
  where job.id = target_job_id
  for update of job;

  if not found then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  select client.company_id
  into target_company_id
  from public.sites site
  join public.clients client on client.id = site.client_id
  where site.id = target_job.site_id;

  if not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if target_job.status in ('completed', 'cancelled') then
    raise check_violation using message = 'Job can no longer be cancelled';
  end if;

  resolution_time := clock_timestamp();

  select coalesce(array_agg(assignment.cleaner_id order by assignment.cleaner_id), array[]::uuid[])
  into assigned_cleaner_ids
  from public.job_assignments assignment
  where assignment.job_id = target_job.id
    and assignment.unassigned_at is null;

  update public.jobs
  set status = 'cancelled'
  where id = target_job.id;

  update public.job_assignments assignment
  set unassigned_at = resolution_time
  where assignment.job_id = target_job.id
    and assignment.unassigned_at is null;

  insert into public.notifications (recipient_id, job_id, type)
  select cleaner_id, target_job.id, 'job_cancelled'
  from unnest(assigned_cleaner_ids) as released(cleaner_id);
end;
$$;

create function public.get_cleaner_job_access(target_job_id uuid)
returns table (address text, access_notes text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_assignment_id uuid;
  target_site_id uuid;
  target_address text;
  target_access_notes text;
begin
  select
    assignment.id,
    site.id,
    site.address,
    coalesce(site.access_notes, '')
  into
    target_assignment_id,
    target_site_id,
    target_address,
    target_access_notes
  from public.jobs job
  join public.job_assignments assignment on assignment.job_id = job.id
  join public.sites site on site.id = job.site_id
  join public.clients client on client.id = site.client_id
  join public.companies company on company.id = client.company_id
  where job.id = target_job_id
    and assignment.cleaner_id = caller_id
    and assignment.unassigned_at is null
    and job.status in ('draft', 'posted', 'assigned', 'on_the_way', 'in_progress')
    and company.status = 'approved'
    and (
      job.status in ('on_the_way', 'in_progress')
      or exists (
        select 1
        from public.profiles profile
        join public.company_members membership
          on membership.profile_id = profile.id
        where profile.id = caller_id
          and profile.role = 'cleaner'
          and membership.company_id = client.company_id
          and membership.status = 'active'
      )
    )
  for share of job, assignment;

  if caller_id is null or not found then
    raise insufficient_privilege using message = 'Job access is unavailable';
  end if;

  insert into public.site_access_log (
    job_id,
    site_id,
    assignment_id,
    cleaner_id
  ) values (
    target_job_id,
    target_site_id,
    target_assignment_id,
    caller_id
  );

  return query select target_address, target_access_notes;
end;
$$;

revoke all on function public.apply_to_job(uuid)
  from public, anon, authenticated;
revoke all on function public.withdraw_application(uuid)
  from public, anon, authenticated;
revoke all on function public.post_job(uuid)
  from public, anon, authenticated;
revoke all on function public.assign_job_slot(uuid, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.update_job_status(uuid, public.job_status)
  from public, anon, authenticated;
revoke all on function public.cancel_job(uuid)
  from public, anon, authenticated;
revoke all on function public.get_cleaner_job_access(uuid)
  from public, anon, authenticated;
revoke all on function public.mark_generated_job_application_edit()
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_cancelled_job_applications()
  from public, anon, authenticated, service_role;
revoke all on function public.release_cleaner_loop_state(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.apply_to_job(uuid)
  to authenticated, service_role;
grant execute on function public.withdraw_application(uuid)
  to authenticated, service_role;
grant execute on function public.post_job(uuid)
  to authenticated, service_role;
grant execute on function public.assign_job_slot(uuid, integer, uuid)
  to authenticated, service_role;
grant execute on function public.update_job_status(uuid, public.job_status)
  to authenticated, service_role;
grant execute on function public.cancel_job(uuid)
  to authenticated, service_role;
grant execute on function public.get_cleaner_job_access(uuid)
  to authenticated, service_role;
