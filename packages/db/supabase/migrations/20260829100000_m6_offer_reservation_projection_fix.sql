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
    from (
      select offer.cleaner_id
      from public.offers offer
      where offer.job_id = job.id
        and offer.status = 'pending'
      union
      select named.cleaner_id
      from public.recurring_assignment_cleaners named
      where named.recurring_assignment_id = job.recurring_assignment_id
        and named.accepted_at is null
    ) reserved(cleaner_id)
    where not exists (
      select 1
      from public.job_assignments assignment
      where assignment.job_id = job.id
        and assignment.cleaner_id = reserved.cleaner_id
        and assignment.unassigned_at is null
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
    select count(*)
    from (
      select offer.cleaner_id
      from public.offers offer
      where offer.job_id = job.id
        and offer.status = 'pending'
      union
      select named.cleaner_id
      from public.recurring_assignment_cleaners named
      where named.recurring_assignment_id = job.recurring_assignment_id
        and named.accepted_at is null
    ) reserved(cleaner_id)
    where not exists (
      select 1
      from public.job_assignments assignment
      where assignment.job_id = job.id
        and assignment.cleaner_id = reserved.cleaner_id
        and assignment.unassigned_at is null
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

revoke execute on function public.assign_job_slot(uuid, integer, uuid)
  from authenticated;
