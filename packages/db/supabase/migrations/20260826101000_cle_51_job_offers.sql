create table public.offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  cleaner_id uuid not null references public.profiles (id) on delete restrict,
  job_id uuid references public.jobs (id) on delete cascade,
  recurring_assignment_id uuid
    references public.recurring_assignments (id) on delete cascade,
  status public.offer_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint offers_exactly_one_target check (
    num_nonnulls(job_id, recurring_assignment_id) = 1
  ),
  constraint offers_resolution_matches_status check (
    (status = 'pending' and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null)
  )
);

create unique index offers_pending_job_cleaner_idx
on public.offers (job_id, cleaner_id)
where status = 'pending' and job_id is not null;

create unique index offers_pending_recurring_cleaner_idx
on public.offers (recurring_assignment_id, cleaner_id)
where status = 'pending' and recurring_assignment_id is not null;

create index offers_pending_job_idx
on public.offers (job_id)
where status = 'pending' and job_id is not null;

create index offers_cleaner_status_idx
on public.offers (cleaner_id, status);

alter table public.offers enable row level security;

create policy offers_select_admin
on public.offers
for select
to authenticated
using (public.is_company_admin(company_id));

revoke all on table public.offers from public, anon, authenticated;
grant select on table public.offers to authenticated;
grant all on table public.offers to service_role;

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
    select count(*)
    from public.offers offer
    where offer.job_id = job.id
      and offer.status = 'pending'
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
    select count(*)
    from public.offers offer
    where offer.job_id = job.id
      and offer.status = 'pending'
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

create view public.cleaner_offers
with (security_invoker = false, security_barrier = true)
as
select
  offer.id as offer_id,
  offer.status,
  offer.created_at,
  offer.resolved_at,
  offer.company_id,
  company.name as company_name,
  case
    when offer.job_id is not null then 'job'::text
    else 'recurring_assignment'::text
  end as target_kind,
  offer.job_id,
  offer.recurring_assignment_id,
  site.name as site_name,
  site.suburb,
  service.id as service_id,
  service.name as service_name,
  service.slug as service_slug,
  job.scheduled_start,
  rule.weekday,
  rule.local_start_time,
  rule.frequency,
  coalesce(job.duration_minutes, rule.duration_minutes) as duration_minutes,
  coalesce(job.cleaner_pay_cents, rule.cleaner_pay_cents) as cleaner_pay_cents,
  coalesce(job.crew_size, rule.crew_size) as crew_size
from public.offers offer
join public.companies company on company.id = offer.company_id
left join public.jobs job on job.id = offer.job_id
left join public.recurring_assignments rule
  on rule.id = offer.recurring_assignment_id
join public.sites site on site.id = coalesce(job.site_id, rule.site_id)
join public.service_catalogue service
  on service.id = coalesce(job.service_id, rule.service_id)
where offer.cleaner_id = auth.uid()
order by (offer.status = 'pending') desc, offer.created_at desc;

revoke all on table public.cleaner_offers from public, anon, authenticated;
grant select on table public.cleaner_offers to authenticated, service_role;

create function public.offer_job(
  target_job_id uuid,
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
  active_assignment_count integer;
  pending_offer_count integer;
  offer_id uuid;
begin
  select client.company_id
  into expected_company_id
  from public.jobs job
  join public.sites site on site.id = job.site_id
  join public.clients client on client.id = site.client_id
  where job.id = target_job_id;

  if not found or not public.is_company_admin(expected_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
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

  if target_company_id is distinct from expected_company_id
    or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if target_job.status not in ('draft', 'posted') then
    raise check_violation using message = 'Job is not open for assignment';
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
    from public.job_applications application
    where application.job_id = target_job.id
      and application.cleaner_id = target_cleaner_id
  ) then
    raise check_violation using message = 'Cleaner has already applied to this job';
  end if;

  if exists (
    select 1
    from public.job_assignments assignment
    where assignment.job_id = target_job.id
      and assignment.cleaner_id = target_cleaner_id
      and assignment.unassigned_at is null
  ) then
    raise check_violation using message = 'Cleaner is already assigned to this job';
  end if;

  if exists (
    select 1
    from public.offers offer
    where offer.job_id = target_job.id
      and offer.cleaner_id = target_cleaner_id
      and offer.status = 'pending'
  ) then
    raise check_violation using
      message = 'Cleaner already has a pending offer for this job';
  end if;

  select count(*)::integer
  into active_assignment_count
  from public.job_assignments assignment
  where assignment.job_id = target_job.id
    and assignment.unassigned_at is null;

  select count(*)::integer
  into pending_offer_count
  from public.offers offer
  where offer.job_id = target_job.id
    and offer.status = 'pending';

  if active_assignment_count + pending_offer_count >= target_job.crew_size then
    raise check_violation using message = 'No open slot is available';
  end if;

  insert into public.offers (
    company_id,
    cleaner_id,
    job_id
  ) values (
    target_company_id,
    target_cleaner_id,
    target_job.id
  )
  returning id into offer_id;

  insert into public.notifications (recipient_id, job_id, type)
  values (target_cleaner_id, target_job.id, 'offer_received');

  return offer_id;
end;
$$;

create or replace function public.assign_job_slot(
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
  pending_offer_count integer;
  resolution_time timestamptz;
begin
  select client.company_id
  into expected_company_id
  from public.jobs job
  join public.sites site on site.id = job.site_id
  join public.clients client on client.id = site.client_id
  where job.id = target_job_id;

  if not found or not public.is_company_admin(expected_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  perform 1
  from public.profiles profile
  join public.company_members membership
    on membership.profile_id = profile.id
  where profile.id = target_cleaner_id
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

  if target_company_id is distinct from expected_company_id
    or not public.is_company_admin(target_company_id) then
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

  if exists (
    select 1
    from public.offers offer
    where offer.job_id = target_job.id
      and offer.cleaner_id = target_cleaner_id
      and offer.status = 'pending'
  ) then
    raise check_violation using message = 'Revoke the pending offer first';
  end if;

  select count(*)::integer
  into active_assignment_count
  from public.job_assignments assignment
  where assignment.job_id = target_job.id
    and assignment.unassigned_at is null;

  select count(*)::integer
  into pending_offer_count
  from public.offers offer
  where offer.job_id = target_job.id
    and offer.status = 'pending';

  if active_assignment_count + pending_offer_count >= target_job.crew_size then
    raise check_violation using message = 'Revoke the pending offer first';
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
    raise check_violation using message = 'Cleaner is unavailable for this time';
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

create function public.accept_offer(target_offer_id uuid)
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
begin
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

  if target_offer.job_id is null then
    raise feature_not_supported using message = 'Series offers are not available yet';
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

create function public.decline_offer(target_offer_id uuid)
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
  where offer.id = target_offer_id
  for update of offer;

  if not found or caller_id is null or target_offer.cleaner_id <> caller_id then
    raise insufficient_privilege using message = 'Offered cleaner access required';
  end if;

  if target_offer.status <> 'pending' then
    raise check_violation using message = 'Offer is no longer pending';
  end if;

  if target_offer.job_id is null then
    raise feature_not_supported using message = 'Series offers are not available yet';
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

create function public.revoke_offer(target_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_offer public.offers;
begin
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

  if target_offer.job_id is null then
    raise feature_not_supported using message = 'Series offers are not available yet';
  end if;

  update public.offers
  set status = 'revoked', resolved_at = clock_timestamp()
  where id = target_offer.id;
end;
$$;

create or replace function public.resolve_cancelled_job_applications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolution_time timestamptz := clock_timestamp();
begin
  update public.job_applications
  set
    status = 'not_selected',
    resolved_at = resolution_time
  where job_id = new.id
    and status = 'applied';

  update public.offers
  set
    status = 'revoked',
    resolved_at = resolution_time
  where job_id = new.id
    and status = 'pending';

  return new;
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
    update public.offers
    set
      status = 'revoked',
      resolved_at = clock_timestamp()
    where company_id = old.company_id
      and cleaner_id = old.profile_id
      and status = 'pending';

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

revoke all on function public.offer_job(uuid, uuid) from public, anon;
revoke all on function public.accept_offer(uuid) from public, anon;
revoke all on function public.decline_offer(uuid) from public, anon;
revoke all on function public.revoke_offer(uuid) from public, anon;
grant execute on function public.offer_job(uuid, uuid) to authenticated, service_role;
grant execute on function public.accept_offer(uuid) to authenticated, service_role;
grant execute on function public.decline_offer(uuid) to authenticated, service_role;
grant execute on function public.revoke_offer(uuid) to authenticated, service_role;
