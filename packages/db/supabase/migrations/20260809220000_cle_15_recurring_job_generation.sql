create extension if not exists pg_cron with schema pg_catalog;

create type public.assignment_source as enum ('manual', 'recurring');

alter table public.recurring_assignments
  add column generation_version bigint not null default 1
    check (generation_version >= 1);

alter table public.jobs
  add column recurring_assignment_id uuid
    references public.recurring_assignments (id) on delete restrict,
  add column service_date date,
  add column generated_rule_version bigint,
  add column generated_at timestamptz,
  add column manually_edited_at timestamptz,
  add column cancelled_by_rule_deactivation_at timestamptz,
  add constraint jobs_recurring_provenance_complete check (
    (
      recurring_assignment_id is null
      and service_date is null
      and generated_rule_version is null
      and generated_at is null
      and cancelled_by_rule_deactivation_at is null
    )
    or (
      recurring_assignment_id is not null
      and service_date is not null
      and generated_rule_version is not null
      and generated_rule_version >= 1
      and generated_at is not null
    )
  ),
  add constraint jobs_recurring_assignment_service_date_key
    unique (recurring_assignment_id, service_date);

alter table public.job_assignments
  add column source public.assignment_source not null default 'manual';

create table public.recurring_generation_failures (
  recurring_assignment_id uuid primary key
    references public.recurring_assignments (id) on delete cascade,
  failed_at timestamptz not null default now(),
  error_code text not null check (char_length(error_code) = 5),
  error_message text not null
);

alter table public.recurring_generation_failures enable row level security;
revoke all on table public.recurring_generation_failures
  from public, anon, authenticated;
grant all on table public.recurring_generation_failures to service_role;

create index jobs_recurring_assignment_idx
  on public.jobs (recurring_assignment_id, service_date)
  where recurring_assignment_id is not null;

create or replace function public.mark_generated_job_manual_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.recurring_assignment_id is not null
    and coalesce(current_setting('app.recurring_generation', true), '') <> 'on'
    and (
      new.site_id is distinct from old.site_id
      or new.service_id is distinct from old.service_id
      or new.scheduled_start is distinct from old.scheduled_start
      or new.duration_minutes is distinct from old.duration_minutes
      or new.cleaner_pay_cents is distinct from old.cleaner_pay_cents
      or new.client_charge_cents is distinct from old.client_charge_cents
      or new.crew_size is distinct from old.crew_size
      or new.status is distinct from old.status
    ) then
    new.manually_edited_at := coalesce(new.manually_edited_at, clock_timestamp());
  end if;

  return new;
end;
$$;

create trigger jobs_mark_generated_manual_edit
before update on public.jobs
for each row execute function public.mark_generated_job_manual_edit();

create function public.mark_generated_job_assignment_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job_id uuid;
begin
  if coalesce(current_setting('app.recurring_generation', true), '') = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  target_job_id := case when tg_op = 'DELETE' then old.job_id else new.job_id end;

  update public.jobs
  set manually_edited_at = coalesce(manually_edited_at, clock_timestamp())
  where id = target_job_id
    and recurring_assignment_id is not null;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger job_assignments_mark_generated_manual_edit
after insert or update or delete on public.job_assignments
for each row execute function public.mark_generated_job_assignment_edit();

create or replace function public.reconcile_recurring_assignment_jobs(
  target_recurring_assignment_id uuid,
  as_of timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_rule public.recurring_assignments;
  target_timezone text;
  local_today date;
  horizon_end date;
  candidate_date date;
  candidate_start timestamptz;
  target_job_id uuid;
  named_cleaner_count integer;
  changed_count integer := 0;
  affected_rows integer;
  previous_generation_context text;
begin
  select rule.*
  into target_rule
  from public.recurring_assignments rule
  where rule.id = target_recurring_assignment_id
  for update of rule;

  if not found then
    raise foreign_key_violation using message = 'Recurring assignment not found';
  end if;

  select company.timezone
  into target_timezone
  from public.sites site
  join public.clients client on client.id = site.client_id
  join public.companies company on company.id = client.company_id
  where site.id = target_rule.site_id;

  previous_generation_context := current_setting('app.recurring_generation', true);
  perform set_config('app.recurring_generation', 'on', true);

  local_today := timezone(target_timezone, as_of)::date;
  horizon_end := local_today + 28;

  if not target_rule.active then
    update public.jobs job
    set
      status = 'cancelled',
      cancelled_by_rule_deactivation_at = as_of
    where job.recurring_assignment_id = target_rule.id
      and job.scheduled_start > as_of
      and job.status = 'posted'
      and job.manually_edited_at is null
      and not exists (
        select 1
        from public.job_assignments assignment
        where assignment.job_id = job.id
          and assignment.unassigned_at is null
      )
      and not exists (
        select 1
        from public.job_assignments assignment
        where assignment.job_id = job.id
          and assignment.source = 'manual'
      );

    get diagnostics changed_count = row_count;
    perform set_config(
      'app.recurring_generation',
      coalesce(previous_generation_context, ''),
      true
    );
    return changed_count;
  end if;

  -- Retire untouched generated dates that no longer belong to the edited rule.
  with obsolete_jobs as (
    select job.id
    from public.jobs job
    where job.recurring_assignment_id = target_rule.id
      and job.scheduled_start > as_of
      and job.status in ('posted', 'assigned')
      and job.manually_edited_at is null
      and not exists (
        select 1
        from public.job_assignments assignment
        where assignment.job_id = job.id
          and assignment.source = 'manual'
      )
      and not (
        job.service_date >= greatest(local_today, target_rule.anchor_date)
        and job.service_date < horizon_end
        and extract(isodow from job.service_date)::smallint = target_rule.weekday
        and (
          target_rule.frequency = 'weekly'
          or mod(job.service_date - target_rule.anchor_date, 14) = 0
        )
        and (
          job.service_date + target_rule.local_start_time
        ) at time zone target_timezone > as_of
      )
    order by job.id
    for update of job
  ), unassigned as (
    update public.job_assignments assignment
    set unassigned_at = clock_timestamp()
    where assignment.job_id in (select id from obsolete_jobs)
      and assignment.source = 'recurring'
      and assignment.unassigned_at is null
    returning assignment.job_id
  )
  update public.jobs job
  set status = 'cancelled'
  where job.id in (select id from obsolete_jobs);

  get diagnostics affected_rows = row_count;
  changed_count := changed_count + affected_rows;

  select count(*)::integer
  into named_cleaner_count
  from public.recurring_assignment_cleaners named
  where named.recurring_assignment_id = target_rule.id;

  for candidate_date in
    select generated_date::date
    from generate_series(
      greatest(local_today, target_rule.anchor_date),
      horizon_end - 1,
      interval '1 day'
    ) as generated(generated_date)
    where extract(isodow from generated_date)::smallint = target_rule.weekday
      and (
        target_rule.frequency = 'weekly'
        or mod(generated_date::date - target_rule.anchor_date, 14) = 0
      )
    order by generated_date
  loop
    candidate_start := (
      candidate_date + target_rule.local_start_time
    ) at time zone target_timezone;

    if candidate_start <= as_of then
      continue;
    end if;

    target_job_id := null;
    insert into public.jobs (
      site_id,
      service_id,
      scheduled_start,
      duration_minutes,
      cleaner_pay_cents,
      status,
      crew_size,
      recurring_assignment_id,
      service_date,
      generated_rule_version,
      generated_at
    ) values (
      target_rule.site_id,
      target_rule.service_id,
      candidate_start,
      target_rule.duration_minutes,
      target_rule.cleaner_pay_cents,
      case
        when named_cleaner_count = target_rule.crew_size then 'assigned'::public.job_status
        else 'posted'::public.job_status
      end,
      target_rule.crew_size,
      target_rule.id,
      candidate_date,
      target_rule.generation_version,
      as_of
    )
    on conflict (recurring_assignment_id, service_date) do nothing
    returning id into target_job_id;

    if target_job_id is not null then
      changed_count := changed_count + 1;
    else
      select job.id
      into target_job_id
      from public.jobs job
      where job.recurring_assignment_id = target_rule.id
        and job.service_date = candidate_date
      for update;

      if not exists (
        select 1
        from public.jobs job
        where job.id = target_job_id
          and job.generated_rule_version <> target_rule.generation_version
          and job.scheduled_start > as_of
          and (
            job.status in ('posted', 'assigned')
            or (
              job.status = 'cancelled'
              and job.cancelled_by_rule_deactivation_at is not null
            )
          )
          and job.manually_edited_at is null
          and not exists (
            select 1
            from public.job_assignments assignment
            where assignment.job_id = job.id
              and assignment.source = 'manual'
          )
      ) then
        continue;
      end if;

      update public.job_assignments assignment
      set unassigned_at = clock_timestamp()
      where assignment.job_id = target_job_id
        and assignment.source = 'recurring'
        and assignment.unassigned_at is null;

      update public.jobs
      set
        site_id = target_rule.site_id,
        service_id = target_rule.service_id,
        scheduled_start = candidate_start,
        duration_minutes = target_rule.duration_minutes,
        cleaner_pay_cents = target_rule.cleaner_pay_cents,
        status = case
          when named_cleaner_count = target_rule.crew_size then 'assigned'::public.job_status
          else 'posted'::public.job_status
        end,
        crew_size = target_rule.crew_size,
        generated_rule_version = target_rule.generation_version,
        generated_at = as_of,
        cancelled_by_rule_deactivation_at = null
      where id = target_job_id;

      changed_count := changed_count + 1;
    end if;

    insert into public.job_assignments (
      job_id,
      slot_number,
      cleaner_id,
      source
    )
    select
      target_job_id,
      named.slot_number,
      named.cleaner_id,
      'recurring'::public.assignment_source
    from public.recurring_assignment_cleaners named
    join public.profiles profile
      on profile.id = named.cleaner_id
      and profile.role = 'cleaner'
    join public.sites site on site.id = target_rule.site_id
    join public.clients client on client.id = site.client_id
    join public.company_members membership
      on membership.company_id = client.company_id
      and membership.profile_id = named.cleaner_id
      and membership.status = 'active'
    where named.recurring_assignment_id = target_rule.id
    order by named.slot_number
    on conflict (job_id, slot_number) where unassigned_at is null do nothing;

    update public.jobs job
    set status = case
      when (
        select count(*)
        from public.job_assignments assignment
        where assignment.job_id = job.id
          and assignment.unassigned_at is null
      ) = job.crew_size then 'assigned'::public.job_status
      else 'posted'::public.job_status
    end
    where job.id = target_job_id;
  end loop;

  perform set_config(
    'app.recurring_generation',
    coalesce(previous_generation_context, ''),
    true
  );
  return changed_count;
end;
$$;

create or replace function public.generate_recurring_jobs_at(
  as_of timestamptz,
  target_recurring_assignment_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_rule_id uuid;
  changed_count integer := 0;
  failure_error_code text;
  failure_error_message text;
begin
  for target_rule_id in
    select rule.id
    from public.recurring_assignments rule
    where target_recurring_assignment_id is null
      or rule.id = target_recurring_assignment_id
    order by rule.id
    for update
  loop
    begin
      changed_count := changed_count + public.reconcile_recurring_assignment_jobs(
        target_rule_id,
        as_of
      );

      delete from public.recurring_generation_failures
      where recurring_assignment_id = target_rule_id;
    exception when others then
      get stacked diagnostics
        failure_error_code = returned_sqlstate,
        failure_error_message = message_text;

      -- Admin mutations target one rule and must remain atomic and visible to
      -- the caller. The nightly all-rule run isolates failures so unrelated
      -- companies still receive their jobs.
      if target_recurring_assignment_id is not null then
        raise;
      end if;

      insert into public.recurring_generation_failures (
        recurring_assignment_id,
        failed_at,
        error_code,
        error_message
      ) values (
        target_rule_id,
        clock_timestamp(),
        failure_error_code,
        left(failure_error_message, 500)
      )
      on conflict (recurring_assignment_id) do update
      set
        failed_at = excluded.failed_at,
        error_code = excluded.error_code,
        error_message = excluded.error_message;
    end;
  end loop;

  return changed_count;
end;
$$;

create function public.generate_recurring_jobs()
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.generate_recurring_jobs_at(clock_timestamp(), null);
$$;

create or replace function public.create_recurring_assignment(
  target_site_id uuid,
  target_service_id uuid,
  target_frequency public.recurrence_frequency,
  target_weekday smallint,
  target_anchor_date date,
  target_local_start_time time without time zone,
  target_duration_minutes integer,
  target_cleaner_pay_cents integer,
  target_crew_size integer,
  named_cleaner_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  new_rule_id uuid;
begin
  select client.company_id
  into target_company_id
  from public.sites site
  join public.clients client on client.id = site.client_id
  where site.id = target_site_id
  for update of site;

  if target_company_id is null
    or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using
      message = 'Only an active company admin can create recurring assignments';
  end if;

  if named_cleaner_ids is null then
    raise check_violation using message = 'Named cleaner list is required';
  end if;

  if cardinality(named_cleaner_ids) > target_crew_size then
    raise check_violation using message = 'Named cleaner count cannot exceed crew size';
  end if;

  if cardinality(named_cleaner_ids) <> (
    select count(distinct cleaner_id)
    from unnest(named_cleaner_ids) as cleaner(cleaner_id)
  ) then
    raise unique_violation using message = 'Named cleaner list cannot contain duplicates';
  end if;

  if exists (
    select 1
    from unnest(named_cleaner_ids) as cleaner(cleaner_id)
    where not exists (
      select 1
      from public.profiles profile
      join public.company_members membership on membership.profile_id = profile.id
      where profile.id = cleaner.cleaner_id
        and profile.role = 'cleaner'
        and membership.company_id = target_company_id
        and membership.status = 'active'
    )
  ) then
    raise check_violation using
      message = 'Named cleaners must be active pool members of the site company';
  end if;

  if not exists (
    select 1
    from public.service_catalogue service
    where service.id = target_service_id
      and service.active
  ) then
    raise check_violation using message = 'Service must be active';
  end if;

  insert into public.recurring_assignments (
    site_id, service_id, frequency, weekday, anchor_date, local_start_time,
    duration_minutes, cleaner_pay_cents, crew_size
  ) values (
    target_site_id, target_service_id, target_frequency, target_weekday,
    target_anchor_date, target_local_start_time, target_duration_minutes,
    target_cleaner_pay_cents, target_crew_size
  )
  returning id into new_rule_id;

  insert into public.recurring_assignment_cleaners (
    recurring_assignment_id, slot_number, cleaner_id
  )
  select new_rule_id, cleaner.ordinality::integer, cleaner.cleaner_id
  from unnest(named_cleaner_ids) with ordinality as cleaner(cleaner_id, ordinality);

  perform public.generate_recurring_jobs_at(clock_timestamp(), new_rule_id);
  return new_rule_id;
end;
$$;

create or replace function public.update_recurring_assignment(
  target_recurring_assignment_id uuid,
  target_service_id uuid,
  target_frequency public.recurrence_frequency,
  target_weekday smallint,
  target_anchor_date date,
  target_local_start_time time without time zone,
  target_duration_minutes integer,
  target_cleaner_pay_cents integer,
  target_crew_size integer,
  named_cleaner_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
begin
  select client.company_id
  into target_company_id
  from public.recurring_assignments rule
  join public.sites site on site.id = rule.site_id
  join public.clients client on client.id = site.client_id
  where rule.id = target_recurring_assignment_id
  for update of rule;

  if target_company_id is null
    or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using
      message = 'Only an active company admin can update recurring assignments';
  end if;

  if named_cleaner_ids is null then
    raise check_violation using message = 'Named cleaner list is required';
  end if;

  if cardinality(named_cleaner_ids) > target_crew_size then
    raise check_violation using message = 'Named cleaner count cannot exceed crew size';
  end if;

  if cardinality(named_cleaner_ids) <> (
    select count(distinct cleaner_id)
    from unnest(named_cleaner_ids) as cleaner(cleaner_id)
  ) then
    raise unique_violation using message = 'Named cleaner list cannot contain duplicates';
  end if;

  if exists (
    select 1
    from unnest(named_cleaner_ids) as cleaner(cleaner_id)
    where not exists (
      select 1
      from public.profiles profile
      join public.company_members membership on membership.profile_id = profile.id
      where profile.id = cleaner.cleaner_id
        and profile.role = 'cleaner'
        and membership.company_id = target_company_id
        and membership.status = 'active'
    )
  ) then
    raise check_violation using
      message = 'Named cleaners must be active pool members of the site company';
  end if;

  if not exists (
    select 1
    from public.service_catalogue service
    where service.id = target_service_id
      and service.active
  ) then
    raise check_violation using message = 'Service must be active';
  end if;

  delete from public.recurring_assignment_cleaners
  where recurring_assignment_id = target_recurring_assignment_id;

  update public.recurring_assignments
  set
    service_id = target_service_id,
    frequency = target_frequency,
    weekday = target_weekday,
    anchor_date = target_anchor_date,
    local_start_time = target_local_start_time,
    duration_minutes = target_duration_minutes,
    cleaner_pay_cents = target_cleaner_pay_cents,
    crew_size = target_crew_size,
    generation_version = generation_version + 1
  where id = target_recurring_assignment_id;

  insert into public.recurring_assignment_cleaners (
    recurring_assignment_id, slot_number, cleaner_id
  )
  select target_recurring_assignment_id, cleaner.ordinality::integer, cleaner.cleaner_id
  from unnest(named_cleaner_ids) with ordinality as cleaner(cleaner_id, ordinality);

  perform public.generate_recurring_jobs_at(
    clock_timestamp(),
    target_recurring_assignment_id
  );
end;
$$;

create or replace function public.set_recurring_assignment_active(
  target_recurring_assignment_id uuid,
  target_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
begin
  select client.company_id
  into target_company_id
  from public.recurring_assignments rule
  join public.sites site on site.id = rule.site_id
  join public.clients client on client.id = site.client_id
  where rule.id = target_recurring_assignment_id
  for update of rule;

  if target_company_id is null
    or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using
      message = 'Only an active company admin can change recurring assignments';
  end if;

  update public.recurring_assignments
  set
    active = target_active,
    generation_version = case
      when active is distinct from target_active then generation_version + 1
      else generation_version
    end
  where id = target_recurring_assignment_id;

  perform public.generate_recurring_jobs_at(
    clock_timestamp(),
    target_recurring_assignment_id
  );
end;
$$;

create or replace function public.compact_recurring_assignment_cleaners(
  target_recurring_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  surviving_cleaner_ids uuid[];
begin
  perform 1
  from public.recurring_assignments rule
  where rule.id = target_recurring_assignment_id
  for update;

  if not found then
    raise foreign_key_violation using message = 'Recurring assignment not found';
  end if;

  select array_agg(named.cleaner_id order by named.slot_number)
  into surviving_cleaner_ids
  from public.recurring_assignment_cleaners named
  where named.recurring_assignment_id = target_recurring_assignment_id;

  delete from public.recurring_assignment_cleaners
  where recurring_assignment_id = target_recurring_assignment_id;

  insert into public.recurring_assignment_cleaners (
    recurring_assignment_id,
    slot_number,
    cleaner_id
  )
  select
    target_recurring_assignment_id,
    cleaner.ordinality::integer,
    cleaner.cleaner_id
  from unnest(
    coalesce(surviving_cleaner_ids, array[]::uuid[])
  ) with ordinality as cleaner(cleaner_id, ordinality);
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
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.reconcile_recurring_assignment_jobs(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.generate_recurring_jobs_at(timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.generate_recurring_jobs()
  from public, anon, authenticated;
grant execute on function public.generate_recurring_jobs_at(timestamptz, uuid)
  to service_role;
grant execute on function public.generate_recurring_jobs()
  to service_role;

revoke all on function public.mark_generated_job_manual_edit()
  from public, anon, authenticated;
revoke all on function public.mark_generated_job_assignment_edit()
  from public, anon, authenticated;
revoke all on function public.compact_recurring_assignment_cleaners(uuid)
  from public, anon, authenticated, service_role;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'generate-recurring-jobs-brisbane'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'generate-recurring-jobs-brisbane',
    '5 14 * * *',
    'select public.generate_recurring_jobs()'
  );
end;
$$;
