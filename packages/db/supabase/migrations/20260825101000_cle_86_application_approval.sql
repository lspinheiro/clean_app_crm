create or replace function public.apply_to_job(target_job_id uuid)
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
  from public.company_members membership
  where membership.profile_id = caller_id
    and membership.company_id = expected_company_id
    and membership.status = 'active'
  for share of membership;

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
    from public.company_members membership
    join public.companies company on company.id = membership.company_id
    where membership.profile_id = caller_id
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

  insert into public.notifications (recipient_id, job_id, type)
  select membership.profile_id, target_job.id, 'application_received'
  from public.employee_memberships membership
  where membership.company_id = target_company_id
    and membership.status = 'active';

  return application_id;
end;
$$;

create function public.approve_job_application(
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
  target_company_id uuid;
  target_application public.job_applications;
  assignment_id uuid;
begin
  select client.company_id
  into target_company_id
  from public.jobs job
  join public.sites site on site.id = job.site_id
  join public.clients client on client.id = site.client_id
  where job.id = target_job_id;

  if not found or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
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

  perform 1
  from public.jobs job
  where job.id = target_job_id
  for update of job;

  select application.*
  into target_application
  from public.job_applications application
  where application.job_id = target_job_id
    and application.cleaner_id = target_cleaner_id
  for update of application;

  if not found or target_application.status <> 'applied' then
    raise check_violation using message = 'Application is no longer awaiting review';
  end if;

  assignment_id := public.assign_job_slot(
    target_job_id,
    target_slot_number,
    target_cleaner_id
  );

  return assignment_id;
end;
$$;

create function public.mark_job_application_not_selected(
  target_job_id uuid,
  target_cleaner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  target_application public.job_applications;
begin
  select client.company_id
  into target_company_id
  from public.jobs job
  join public.sites site on site.id = job.site_id
  join public.clients client on client.id = site.client_id
  where job.id = target_job_id;

  if not found or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  perform 1
  from public.jobs job
  where job.id = target_job_id
  for update of job;

  select application.*
  into target_application
  from public.job_applications application
  where application.job_id = target_job_id
    and application.cleaner_id = target_cleaner_id
  for update of application;

  if not found then
    raise check_violation using message = 'Application is no longer awaiting review';
  end if;

  if target_application.status = 'not_selected' then
    return;
  end if;

  if target_application.status <> 'applied' then
    raise check_violation using message = 'Application is no longer awaiting review';
  end if;

  update public.job_applications
  set status = 'not_selected', resolved_at = clock_timestamp()
  where id = target_application.id;
end;
$$;

create function public.restore_job_application(
  target_job_id uuid,
  target_cleaner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  target_job public.jobs;
  target_application public.job_applications;
begin
  select client.company_id
  into target_company_id
  from public.jobs job
  join public.sites site on site.id = job.site_id
  join public.clients client on client.id = site.client_id
  where job.id = target_job_id;

  if not found or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  select job.*
  into target_job
  from public.jobs job
  where job.id = target_job_id
  for update of job;

  if target_job.status <> 'posted'
    or (
      select count(*)
      from public.job_assignments assignment
      where assignment.job_id = target_job.id
        and assignment.unassigned_at is null
    ) >= target_job.crew_size then
    raise check_violation using message = 'Job is not open for application review';
  end if;

  select application.*
  into target_application
  from public.job_applications application
  where application.job_id = target_job_id
    and application.cleaner_id = target_cleaner_id
  for update of application;

  if not found then
    raise check_violation using message = 'Application cannot be restored';
  end if;

  if target_application.status = 'applied' then
    return;
  end if;

  if target_application.status <> 'not_selected' then
    raise check_violation using message = 'Application cannot be restored';
  end if;

  if not exists (
    select 1
    from public.company_members membership
    where membership.company_id = target_company_id
      and membership.profile_id = target_cleaner_id
      and membership.status = 'active'
  ) then
    raise check_violation using message = 'Application cannot be restored';
  end if;

  update public.job_applications
  set status = 'applied', resolved_at = null, withdrawn_at = null
  where id = target_application.id;
end;
$$;

create or replace function public.enqueue_notification_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_url text := coalesce(
    nullif(current_setting('app.settings.push_dispatch_url', true), ''),
    'http://kong:8000/functions/v1/push-dispatch'
  );
  dispatch_bearer text := nullif(
    current_setting('app.settings.push_dispatch_bearer', true),
    ''
  );
begin
  if new.type = 'application_received' or dispatch_bearer is null then
    return new;
  end if;

  perform net.http_post(
    url := dispatch_url,
    body := jsonb_build_object(
      'notificationId', new.id,
      'recipientId', new.recipient_id,
      'jobId', new.job_id,
      'type', new.type
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || dispatch_bearer
    ),
    timeout_milliseconds := 2000
  );

  return new;
exception when others then
  raise warning 'Push dispatch enqueue failed for notification %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.approve_job_application(uuid, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.mark_job_application_not_selected(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.restore_job_application(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.approve_job_application(uuid, integer, uuid)
  to authenticated, service_role;
grant execute on function public.mark_job_application_not_selected(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.restore_job_application(uuid, uuid)
  to authenticated, service_role;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_applications'
  ) then
    alter publication supabase_realtime add table public.job_applications;
  end if;

  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
