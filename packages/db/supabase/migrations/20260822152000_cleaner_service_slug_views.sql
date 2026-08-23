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

create or replace view public.cleaner_my_jobs
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
  assignment.assigned_at,
  service.slug as service_slug
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
        and membership.company_id = client.company_id
        and membership.status = 'active'
    )
  );

revoke all on table public.cleaner_job_board from public, anon, authenticated;
revoke all on table public.cleaner_my_jobs from public, anon, authenticated;
grant select on table public.cleaner_job_board to authenticated, service_role;
grant select on table public.cleaner_my_jobs to authenticated, service_role;
