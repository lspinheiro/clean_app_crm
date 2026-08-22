-- Crew size is a tenant-controlled cardinality: the vacancies view and the cleaner
-- job board both expand one row per slot with generate_series(1, crew_size). Until
-- now only the CRM recurring-assignment form capped it at 20, so an employee calling
-- the granted RPCs directly could persist an integer-scale crew size and make roster
-- and board queries unbounded. Twenty is the maximum the CRM already enforces; make
-- it authoritative in the database, where every write path has to pass it.

-- Legacy rows above the cap are rejected by the constraint rather than silently
-- clamped: an oversized crew is a data question for the company, not a migration
-- decision.
alter table public.jobs
  add constraint jobs_crew_size_max check (crew_size <= 20);

alter table public.recurring_assignments
  add constraint recurring_assignments_crew_size_max check (crew_size <= 20);

-- The RPC already states the lower bound in its own words; state the upper bound the
-- same way so a direct caller gets the rule, not a constraint name.
create or replace function public.create_one_off_job(
  target_site_id uuid,
  target_service_id uuid,
  target_local_date date,
  target_local_start_time time,
  target_duration_minutes integer,
  target_cleaner_pay_cents integer,
  target_crew_size integer,
  target_post_now boolean,
  target_client_charge_cents integer default null,
  target_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  created_job_id uuid;
begin
  select client.company_id
  into target_company_id
  from public.sites site
  join public.clients client on client.id = site.client_id
  where site.id = target_site_id;

  if target_company_id is null or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if not exists (
    select 1
    from public.service_catalogue service
    where service.id = target_service_id
      and service.active
  ) then
    raise check_violation using message = 'Service must be active';
  end if;

  if target_local_date is null or target_local_start_time is null then
    raise check_violation using message = 'Date and start time are required';
  end if;

  if target_duration_minutes is null or target_duration_minutes <= 0 then
    raise check_violation using message = 'Duration must be greater than zero';
  end if;

  if target_cleaner_pay_cents is null or target_cleaner_pay_cents <= 0 then
    raise check_violation using message = 'Cleaner pay must be greater than zero';
  end if;

  if target_crew_size is null or target_crew_size < 1 then
    raise check_violation using message = 'Crew size must be at least one';
  end if;

  if target_crew_size > 20 then
    raise check_violation using message = 'Crew size must be 20 or fewer';
  end if;

  if target_post_now is null then
    raise check_violation using message = 'Save mode is required';
  end if;

  if target_client_charge_cents is not null and target_client_charge_cents <= 0 then
    raise check_violation using message = 'Client charge must be greater than zero';
  end if;

  if target_notes is not null and char_length(btrim(target_notes)) > 2000 then
    raise check_violation using message = 'Internal notes must use 2,000 characters or fewer';
  end if;

  insert into public.jobs (
    site_id,
    service_id,
    scheduled_start,
    duration_minutes,
    cleaner_pay_cents,
    client_charge_cents,
    status,
    crew_size,
    notes
  ) values (
    target_site_id,
    target_service_id,
    (target_local_date + target_local_start_time) at time zone 'Australia/Brisbane',
    target_duration_minutes,
    target_cleaner_pay_cents,
    target_client_charge_cents,
    'draft',
    target_crew_size,
    nullif(btrim(target_notes), '')
  )
  returning id into created_job_id;

  if target_post_now then
    perform public.post_job(created_job_id);
  end if;

  return created_job_id;
end;
$$;

revoke all on function public.create_one_off_job(
  uuid,
  uuid,
  date,
  time,
  integer,
  integer,
  integer,
  boolean,
  integer,
  text
) from public, anon;
grant execute on function public.create_one_off_job(
  uuid,
  uuid,
  date,
  time,
  integer,
  integer,
  integer,
  boolean,
  integer,
  text
) to authenticated, service_role;
