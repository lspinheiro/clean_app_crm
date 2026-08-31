alter table public.recurring_assignment_cleaners
  add column accepted_at timestamptz;

-- Existing named-cleaner rules already generate assigned instances. Preserve that
-- delivered standing arrangement while all newly named cleaners start unconsented.
update public.recurring_assignment_cleaners
set accepted_at = created_at;

create function public.offer_series(
  target_recurring_assignment_id uuid,
  target_cleaner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_company_id uuid;
  target_company_id uuid;
  offer_id uuid;
begin
  select client.company_id
  into expected_company_id
  from public.recurring_assignments rule
  join public.sites site on site.id = rule.site_id
  join public.clients client on client.id = site.client_id
  where rule.id = target_recurring_assignment_id;

  if not found or not public.is_company_admin(expected_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  perform 1
  from public.recurring_assignments rule
  where rule.id = target_recurring_assignment_id
  for update of rule;

  if not found then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  select client.company_id
  into target_company_id
  from public.recurring_assignments rule
  join public.sites site on site.id = rule.site_id
  join public.clients client on client.id = site.client_id
  where rule.id = target_recurring_assignment_id;

  if target_company_id is distinct from expected_company_id
    or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  perform 1
  from public.recurring_assignment_cleaners named
  where named.recurring_assignment_id = target_recurring_assignment_id
    and named.cleaner_id = target_cleaner_id
    and named.accepted_at is null
  for update of named;

  if not found then
    raise check_violation using
      message = 'Cleaner must be named on the series without standing consent';
  end if;

  perform 1
  from public.company_members membership
  where membership.company_id = target_company_id
    and membership.profile_id = target_cleaner_id
    and membership.status = 'active'
  for share of membership;

  if not found then
    raise check_violation using message = 'Cleaner is not an active pool member';
  end if;

  if exists (
    select 1
    from public.offers offer
    where offer.recurring_assignment_id = target_recurring_assignment_id
      and offer.cleaner_id = target_cleaner_id
      and offer.status = 'pending'
  ) then
    raise check_violation using
      message = 'Cleaner already has a pending offer for this series';
  end if;

  insert into public.offers (
    company_id,
    cleaner_id,
    recurring_assignment_id
  ) values (
    target_company_id,
    target_cleaner_id,
    target_recurring_assignment_id
  )
  returning id into offer_id;

  return offer_id;
end;
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
  offered_cleaner_id uuid;
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
      from public.company_members membership
      where membership.profile_id = cleaner.cleaner_id
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
    recurring_assignment_id, slot_number, cleaner_id, accepted_at
  )
  select new_rule_id, cleaner.ordinality::integer, cleaner.cleaner_id, null
  from unnest(named_cleaner_ids) with ordinality as cleaner(cleaner_id, ordinality);

  for offered_cleaner_id in
    select named.cleaner_id
    from public.recurring_assignment_cleaners named
    where named.recurring_assignment_id = new_rule_id
    order by named.slot_number
  loop
    perform public.offer_series(new_rule_id, offered_cleaner_id);
  end loop;

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
  existing_cleaner_ids uuid[];
  existing_accepted_ats timestamptz[];
  offered_cleaner_id uuid;
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
      from public.company_members membership
      where membership.profile_id = cleaner.cleaner_id
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

  select
    coalesce(array_agg(named.cleaner_id order by named.slot_number), array[]::uuid[]),
    coalesce(
      array_agg(named.accepted_at order by named.slot_number),
      array[]::timestamptz[]
    )
  into existing_cleaner_ids, existing_accepted_ats
  from public.recurring_assignment_cleaners named
  where named.recurring_assignment_id = target_recurring_assignment_id;

  update public.offers offer
  set status = 'revoked', resolved_at = clock_timestamp()
  where offer.recurring_assignment_id = target_recurring_assignment_id
    and offer.status = 'pending'
    and not (offer.cleaner_id = any(named_cleaner_ids));

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
    recurring_assignment_id, slot_number, cleaner_id, accepted_at
  )
  select
    target_recurring_assignment_id,
    cleaner.ordinality::integer,
    cleaner.cleaner_id,
    case
      when cleaner.cleaner_id = any(existing_cleaner_ids)
        then existing_accepted_ats[array_position(existing_cleaner_ids, cleaner.cleaner_id)]
      else null
    end
  from unnest(named_cleaner_ids) with ordinality as cleaner(cleaner_id, ordinality);

  for offered_cleaner_id in
    select named.cleaner_id
    from public.recurring_assignment_cleaners named
    where named.recurring_assignment_id = target_recurring_assignment_id
      and named.accepted_at is null
      and not exists (
        select 1
        from public.offers offer
        where offer.recurring_assignment_id = named.recurring_assignment_id
          and offer.cleaner_id = named.cleaner_id
          and offer.status = 'pending'
      )
    order by named.slot_number
  loop
    perform public.offer_series(target_recurring_assignment_id, offered_cleaner_id);
  end loop;

  perform public.generate_recurring_jobs_at(
    clock_timestamp(),
    target_recurring_assignment_id
  );
end;
$$;

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
  consented_cleaner_count integer;
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
  into consented_cleaner_count
  from public.recurring_assignment_cleaners named
  where named.recurring_assignment_id = target_rule.id
    and named.accepted_at is not null;

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
        when consented_cleaner_count = target_rule.crew_size
          then 'assigned'::public.job_status
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
          when consented_cleaner_count = target_rule.crew_size
            then 'assigned'::public.job_status
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
    join public.sites site on site.id = target_rule.site_id
    join public.clients client on client.id = site.client_id
    join public.company_members membership
      on membership.company_id = client.company_id
      and membership.profile_id = named.cleaner_id
      and membership.status = 'active'
    where named.recurring_assignment_id = target_rule.id
      and named.accepted_at is not null
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

revoke all on function public.offer_series(uuid, uuid) from public, anon;
grant execute on function public.offer_series(uuid, uuid)
  to authenticated, service_role;

create or replace view public.vacancies
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
cross join lateral (
  select candidate.slot_number
  from generate_series(1, job.crew_size) as candidate(slot_number)
  where not exists (
    select 1
    from public.job_assignments assignment
    where assignment.job_id = job.id
      and assignment.slot_number = candidate.slot_number
      and assignment.unassigned_at is null
  )
  order by candidate.slot_number
  offset (
    (
      select count(*)
      from public.offers offer
      where offer.job_id = job.id
        and offer.status = 'pending'
    )
    +
    (
      select count(*)
      from public.recurring_assignment_cleaners named
      where named.recurring_assignment_id = job.recurring_assignment_id
        and named.accepted_at is null
    )
  )
) slot
where job.status in ('posted', 'assigned');

revoke all on table public.vacancies from public, anon, authenticated;
grant select on table public.vacancies to authenticated, service_role;

create or replace view public.cleaner_job_board
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
  application.status as my_application_status,
  service.slug as service_slug
from public.jobs job
join public.sites site on site.id = job.site_id
join public.clients client on client.id = site.client_id
join public.companies company on company.id = client.company_id
join public.service_catalogue service on service.id = job.service_id
cross join lateral (
  select candidate.slot_number
  from generate_series(1, job.crew_size) as candidate(slot_number)
  where not exists (
    select 1
    from public.job_assignments assignment
    where assignment.job_id = job.id
      and assignment.slot_number = candidate.slot_number
      and assignment.unassigned_at is null
  )
  order by candidate.slot_number
  offset (
    (
      select count(*)
      from public.offers offer
      where offer.job_id = job.id
        and offer.status = 'pending'
    )
    +
    (
      select count(*)
      from public.recurring_assignment_cleaners named
      where named.recurring_assignment_id = job.recurring_assignment_id
        and named.accepted_at is null
    )
  )
) slot
left join public.job_applications application
  on application.job_id = job.id
  and application.cleaner_id = auth.uid()
where job.status = 'posted'
  and company.status = 'approved'
  and exists (
    select 1
    from public.company_members membership
    where membership.profile_id = auth.uid()
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

revoke all on table public.cleaner_job_board from public, anon, authenticated;
grant select on table public.cleaner_job_board to authenticated, service_role;

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
  surviving_accepted_ats timestamptz[];
begin
  perform 1
  from public.recurring_assignments rule
  where rule.id = target_recurring_assignment_id
  for update;

  if not found then
    raise foreign_key_violation using message = 'Recurring assignment not found';
  end if;

  select
    array_agg(named.cleaner_id order by named.slot_number),
    array_agg(named.accepted_at order by named.slot_number)
  into surviving_cleaner_ids, surviving_accepted_ats
  from public.recurring_assignment_cleaners named
  where named.recurring_assignment_id = target_recurring_assignment_id;

  delete from public.recurring_assignment_cleaners
  where recurring_assignment_id = target_recurring_assignment_id;

  insert into public.recurring_assignment_cleaners (
    recurring_assignment_id,
    slot_number,
    cleaner_id,
    accepted_at
  )
  select
    target_recurring_assignment_id,
    cleaner.ordinality::integer,
    cleaner.cleaner_id,
    surviving_accepted_ats[cleaner.ordinality]
  from unnest(
    coalesce(surviving_cleaner_ids, array[]::uuid[])
  ) with ordinality as cleaner(cleaner_id, ordinality);
end;
$$;

create or replace function public.accept_offer(target_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_offer public.offers;
  target_job public.jobs;
  target_slot_number integer;
  assignment_id uuid;
  active_assignment_count integer;
  resolution_time timestamptz;
  failure_error_code text;
  failure_error_message text;
begin
  select offer.*
  into target_offer
  from public.offers offer
  where offer.id = target_offer_id;

  if not found or caller_id is null or target_offer.cleaner_id <> caller_id then
    raise insufficient_privilege using message = 'Offered cleaner access required';
  end if;

  if target_offer.status <> 'pending' then
    raise check_violation using message = 'Offer is no longer pending';
  end if;

  if target_offer.recurring_assignment_id is not null then
    perform 1
    from public.recurring_assignments rule
    where rule.id = target_offer.recurring_assignment_id
    for update of rule;

    if not found then
      raise check_violation using message = 'Series is no longer available';
    end if;

    select offer.*
    into target_offer
    from public.offers offer
    where offer.id = target_offer_id
    for update of offer;

    if not found or target_offer.cleaner_id <> caller_id then
      raise insufficient_privilege using message = 'Offered cleaner access required';
    end if;

    if target_offer.status <> 'pending' then
      raise check_violation using message = 'Offer is no longer pending';
    end if;

    perform 1
    from public.company_members membership
    where membership.company_id = target_offer.company_id
      and membership.profile_id = caller_id
      and membership.status = 'active'
    for share of membership;

    if not found then
      raise insufficient_privilege using message = 'Offered cleaner access required';
    end if;

    perform 1
    from public.recurring_assignment_cleaners named
    where named.recurring_assignment_id = target_offer.recurring_assignment_id
      and named.cleaner_id = caller_id
      and named.accepted_at is null
    for update of named;

    if not found then
      raise check_violation using message = 'Series is no longer available';
    end if;

    resolution_time := clock_timestamp();

    update public.recurring_assignment_cleaners
    set accepted_at = resolution_time
    where recurring_assignment_id = target_offer.recurring_assignment_id
      and cleaner_id = caller_id;

    update public.offers
    set status = 'accepted', resolved_at = resolution_time
    where id = target_offer.id;

    update public.recurring_assignments
    set generation_version = generation_version + 1
    where id = target_offer.recurring_assignment_id;

    begin
      perform public.reconcile_recurring_assignment_jobs(
        target_offer.recurring_assignment_id,
        resolution_time
      );

      delete from public.recurring_generation_failures
      where recurring_assignment_id = target_offer.recurring_assignment_id;
    exception when others then
      get stacked diagnostics
        failure_error_code = returned_sqlstate,
        failure_error_message = message_text;

      insert into public.recurring_generation_failures (
        recurring_assignment_id,
        failed_at,
        error_code,
        error_message
      ) values (
        target_offer.recurring_assignment_id,
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

    return target_offer.recurring_assignment_id;
  end if;

  select offer.*
  into target_offer
  from public.offers offer
  where offer.id = target_offer_id
  for update of offer;

  if not found or caller_id is null or target_offer.cleaner_id <> caller_id then
    raise insufficient_privilege using message = 'Offered cleaner access required';
  end if;

  if target_offer.status <> 'pending' then
    raise check_violation using message = 'Offer is no longer pending';
  end if;

  perform 1
  from public.company_members membership
  where membership.company_id = target_offer.company_id
    and membership.profile_id = caller_id
    and membership.status = 'active'
  for share of membership;

  if not found then
    raise insufficient_privilege using message = 'Offered cleaner access required';
  end if;

  select job.*
  into target_job
  from public.jobs job
  where job.id = target_offer.job_id
  for update of job;

  if not found or target_job.status not in ('draft', 'posted') then
    raise check_violation using message = 'No open slot is available';
  end if;

  select candidate.slot_number
  into target_slot_number
  from generate_series(1, target_job.crew_size) as candidate(slot_number)
  where not exists (
    select 1
    from public.job_assignments assignment
    where assignment.job_id = target_job.id
      and assignment.slot_number = candidate.slot_number
      and assignment.unassigned_at is null
  )
  order by candidate.slot_number
  limit 1;

  if not found then
    raise check_violation using message = 'No open slot is available';
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
      caller_id,
      'manual'
    )
    returning id into assignment_id;
  exception when exclusion_violation then
    raise check_violation using message = 'Cleaner is unavailable for this time';
  end;

  resolution_time := clock_timestamp();

  update public.offers
  set status = 'accepted', resolved_at = resolution_time
  where id = target_offer.id;

  insert into public.notifications (recipient_id, job_id, type)
  values (caller_id, target_job.id, 'job_assigned');

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
    set status = 'not_selected', resolved_at = resolution_time
    where application.job_id = target_job.id
      and application.status = 'applied';
  end if;

  return assignment_id;
end;
$$;

create or replace function public.decline_offer(target_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_offer public.offers;
  resolution_time timestamptz;
begin
  select offer.*
  into target_offer
  from public.offers offer
  where offer.id = target_offer_id;

  if not found or caller_id is null or target_offer.cleaner_id <> caller_id then
    raise insufficient_privilege using message = 'Offered cleaner access required';
  end if;

  if target_offer.status <> 'pending' then
    raise check_violation using message = 'Offer is no longer pending';
  end if;

  if target_offer.recurring_assignment_id is not null then
    perform 1
    from public.recurring_assignments rule
    where rule.id = target_offer.recurring_assignment_id
    for update of rule;

    if not found then
      raise check_violation using message = 'Series is no longer available';
    end if;

    select offer.*
    into target_offer
    from public.offers offer
    where offer.id = target_offer_id
    for update of offer;

    if not found or target_offer.cleaner_id <> caller_id then
      raise insufficient_privilege using message = 'Offered cleaner access required';
    end if;

    if target_offer.status <> 'pending' then
      raise check_violation using message = 'Offer is no longer pending';
    end if;

    resolution_time := clock_timestamp();

    update public.offers
    set status = 'declined', resolved_at = resolution_time
    where id = target_offer.id;

    delete from public.recurring_assignment_cleaners
    where recurring_assignment_id = target_offer.recurring_assignment_id
      and cleaner_id = caller_id
      and accepted_at is null;

    if not found then
      raise check_violation using message = 'Series is no longer available';
    end if;

    perform public.compact_recurring_assignment_cleaners(
      target_offer.recurring_assignment_id
    );

    update public.recurring_assignments
    set generation_version = generation_version + 1
    where id = target_offer.recurring_assignment_id;

    perform public.generate_recurring_jobs_at(
      resolution_time,
      target_offer.recurring_assignment_id
    );
    return;
  end if;

  select offer.*
  into target_offer
  from public.offers offer
  where offer.id = target_offer_id
  for update of offer;

  if not found or caller_id is null or target_offer.cleaner_id <> caller_id then
    raise insufficient_privilege using message = 'Offered cleaner access required';
  end if;

  if target_offer.status <> 'pending' then
    raise check_violation using message = 'Offer is no longer pending';
  end if;

  resolution_time := clock_timestamp();

  update public.offers
  set status = 'declined', resolved_at = resolution_time
  where id = target_offer.id;

  insert into public.notifications (recipient_id, job_id, type)
  select membership.profile_id, target_offer.job_id, 'offer_declined'
  from public.employee_memberships membership
  where membership.company_id = target_offer.company_id
    and membership.status = 'active';
end;
$$;

create or replace function public.revoke_offer(target_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_offer public.offers;
  resolution_time timestamptz;
begin
  select offer.*
  into target_offer
  from public.offers offer
  where offer.id = target_offer_id;

  if not found or not public.is_company_admin(target_offer.company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if target_offer.status <> 'pending' then
    raise check_violation using message = 'Offer is no longer pending';
  end if;

  if target_offer.recurring_assignment_id is not null then
    perform 1
    from public.recurring_assignments rule
    where rule.id = target_offer.recurring_assignment_id
    for update of rule;

    if not found then
      raise check_violation using message = 'Series is no longer available';
    end if;

    select offer.*
    into target_offer
    from public.offers offer
    where offer.id = target_offer_id
    for update of offer;

    if not found or not public.is_company_admin(target_offer.company_id) then
      raise insufficient_privilege using message = 'Company admin access required';
    end if;

    if target_offer.status <> 'pending' then
      raise check_violation using message = 'Offer is no longer pending';
    end if;

    resolution_time := clock_timestamp();

    update public.offers
    set status = 'revoked', resolved_at = resolution_time
    where id = target_offer.id;

    delete from public.recurring_assignment_cleaners
    where recurring_assignment_id = target_offer.recurring_assignment_id
      and cleaner_id = target_offer.cleaner_id
      and accepted_at is null;

    if not found then
      raise check_violation using message = 'Series is no longer available';
    end if;

    perform public.compact_recurring_assignment_cleaners(
      target_offer.recurring_assignment_id
    );

    update public.recurring_assignments
    set generation_version = generation_version + 1
    where id = target_offer.recurring_assignment_id;

    perform public.generate_recurring_jobs_at(
      resolution_time,
      target_offer.recurring_assignment_id
    );
    return;
  end if;

  select offer.*
  into target_offer
  from public.offers offer
  where offer.id = target_offer_id
  for update of offer;

  if not found or not public.is_company_admin(target_offer.company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if target_offer.status <> 'pending' then
    raise check_violation using message = 'Offer is no longer pending';
  end if;

  update public.offers
  set status = 'revoked', resolved_at = clock_timestamp()
  where id = target_offer.id;
end;
$$;
