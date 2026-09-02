create table public.postings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{16}$'),
  intent public.posting_intent not null,
  public_description text not null
    check (btrim(public_description) <> '' and char_length(public_description) <= 2000),
  job_id uuid references public.jobs (id) on delete cascade,
  recurring_assignment_id uuid
    references public.recurring_assignments (id) on delete cascade,
  expires_at timestamptz,
  application_cap integer check (application_cap > 0),
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint postings_intent_target_check check (
    (intent = 'expression_of_interest' and job_id is null and recurring_assignment_id is null)
    or (intent = 'one_time' and job_id is not null and recurring_assignment_id is null)
    or (intent = 'regular' and job_id is null and recurring_assignment_id is not null)
  )
);

create index postings_company_created_idx
  on public.postings (company_id, created_at desc);
create index postings_job_idx on public.postings (job_id) where job_id is not null;
create index postings_recurring_assignment_idx
  on public.postings (recurring_assignment_id)
  where recurring_assignment_id is not null;

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  state public.join_request_state not null default 'waiting',
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (company_id, profile_id),
  constraint join_requests_decision_matches_state check (
    (state = 'waiting' and decided_at is null)
    or (state in ('admitted', 'rejected') and decided_at is not null)
  )
);

create index join_requests_company_state_idx
  on public.join_requests (company_id, state, created_at);
create index join_requests_profile_idx
  on public.join_requests (profile_id, created_at desc);

alter table public.job_applications
  alter column job_id drop not null,
  add column recurring_assignment_id uuid
    references public.recurring_assignments (id) on delete cascade,
  add column posting_id uuid references public.postings (id) on delete cascade,
  add column join_request_id uuid references public.join_requests (id) on delete cascade;

alter table public.job_applications
  drop constraint job_applications_resolution_matches_status,
  add constraint job_applications_resolution_matches_status check (
    (
      status = 'applied'
      and resolved_at is null
      and withdrawn_at is null
    )
    or (
      status in ('assigned', 'not_selected', 'hired', 'job_filled', 'posting_closed')
      and resolved_at is not null
      and withdrawn_at is null
    )
    or (
      status = 'withdrawn'
      and resolved_at is not null
      and withdrawn_at is not null
    )
  ),
  add constraint job_applications_has_target check (
    (posting_id is null and job_id is not null and recurring_assignment_id is null
      and join_request_id is null)
    or posting_id is not null
  ),
  add constraint job_applications_one_work_target check (
    not (job_id is not null and recurring_assignment_id is not null)
  );

create unique index job_applications_posting_cleaner_key
  on public.job_applications (posting_id, cleaner_id)
  where posting_id is not null;
create unique index job_applications_recurring_cleaner_key
  on public.job_applications (recurring_assignment_id, cleaner_id)
  where recurring_assignment_id is not null;
create index job_applications_join_request_idx
  on public.job_applications (join_request_id, status)
  where join_request_id is not null;

alter table public.notifications
  alter column job_id drop not null,
  add column posting_id uuid references public.postings (id) on delete cascade,
  add column join_request_id uuid references public.join_requests (id) on delete cascade,
  add column recurring_assignment_id uuid
    references public.recurring_assignments (id) on delete cascade;

alter table public.postings enable row level security;
alter table public.join_requests enable row level security;

create policy postings_select_admin
on public.postings
for select
to authenticated
using (public.is_company_admin(company_id));

create policy join_requests_select_admin
on public.join_requests
for select
to authenticated
using (public.is_company_admin(company_id));

revoke all on table public.postings from public, anon, authenticated;
revoke all on table public.join_requests from public, anon, authenticated;
grant select on table public.postings to authenticated;
grant select on table public.join_requests to authenticated;
grant all on table public.postings to service_role;
grant all on table public.join_requests to service_role;

create function public.posting_closing_reason(target_posting_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when posting.revoked_at is not null then 'revoked'
    when posting.expires_at is not null and posting.expires_at <= now() then 'expired'
    when posting.application_cap is not null and (
      select count(*)
      from public.job_applications application
      where application.posting_id = posting.id
    ) >= posting.application_cap then 'cap_reached'
    when posting.intent = 'one_time' and (
      select count(*)
      from public.job_assignments assignment
      where assignment.job_id = posting.job_id
        and assignment.unassigned_at is null
    ) >= (
      select job.crew_size from public.jobs job where job.id = posting.job_id
    ) then 'filled'
    when posting.intent = 'regular' and (
      select count(*)
      from public.recurring_assignment_cleaners named
      where named.recurring_assignment_id = posting.recurring_assignment_id
    ) >= (
      select rule.crew_size
      from public.recurring_assignments rule
      where rule.id = posting.recurring_assignment_id
    ) then 'filled'
    when posting.intent = 'one_time' and (
      select job.status not in ('draft', 'posted')
      from public.jobs job
      where job.id = posting.job_id
    ) then 'work_unavailable'
    when posting.intent = 'regular' and not (
      select rule.active
      from public.recurring_assignments rule
      where rule.id = posting.recurring_assignment_id
    ) then 'work_unavailable'
    when posting.intent = 'one_time' and (
      select job.scheduled_start <= now()
      from public.jobs job
      where job.id = posting.job_id
    ) then 'start_passed'
    else null
  end
  from public.postings posting
  where posting.id = target_posting_id
$$;

revoke all on function public.posting_closing_reason(uuid) from public, anon;
grant execute on function public.posting_closing_reason(uuid)
to authenticated, service_role;

create view public.posting_states
with (security_invoker = true, security_barrier = true)
as
select
  posting.id,
  posting.company_id,
  posting.code,
  posting.intent,
  posting.public_description,
  posting.job_id,
  posting.recurring_assignment_id,
  posting.expires_at,
  posting.application_cap,
  posting.revoked_at,
  posting.created_by,
  posting.created_at,
  case
    when public.posting_closing_reason(posting.id) is null then 'active'
    else 'dead'
  end as state,
  public.posting_closing_reason(posting.id) as closing_reason,
  (
    select count(*)::integer
    from public.job_applications application
    where application.posting_id = posting.id
  ) as application_count
from public.postings posting;

revoke all on table public.posting_states from public, anon, authenticated;
grant select on table public.posting_states to authenticated, service_role;

create function public.posting_preview(posting_code text)
returns table (
  state text,
  closing_reason text,
  company_name text,
  intent public.posting_intent,
  public_description text,
  scheduled_start timestamptz,
  weekday smallint,
  local_start_time time without time zone,
  frequency public.recurrence_frequency,
  duration_minutes integer,
  service_name text,
  service_slug text,
  suburb text,
  cleaner_pay_cents integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_posting public.postings;
  dead_reason text;
begin
  select posting.*
  into target_posting
  from public.postings posting
  where posting.code = upper(btrim(posting_code));

  if not found then
    return query select
      'dead'::text, 'unknown'::text, null::text, null::public.posting_intent,
      null::text, null::timestamptz, null::smallint, null::time,
      null::public.recurrence_frequency, null::integer, null::text, null::text,
      null::text, null::integer;
    return;
  end if;

  dead_reason := public.posting_closing_reason(target_posting.id);
  if dead_reason is not null then
    return query select
      'dead'::text, dead_reason, null::text, target_posting.intent,
      null::text, null::timestamptz, null::smallint, null::time,
      null::public.recurrence_frequency, null::integer, null::text, null::text,
      null::text, null::integer;
    return;
  end if;

  return query
  select
    'active'::text,
    null::text,
    company.name,
    target_posting.intent,
    target_posting.public_description,
    job.scheduled_start,
    rule.weekday,
    rule.local_start_time,
    rule.frequency,
    coalesce(job.duration_minutes, rule.duration_minutes),
    service.name,
    service.slug,
    site.suburb,
    coalesce(job.cleaner_pay_cents, rule.cleaner_pay_cents)
  from public.companies company
  left join public.jobs job on job.id = target_posting.job_id
  left join public.recurring_assignments rule
    on rule.id = target_posting.recurring_assignment_id
  left join public.sites site
    on site.id = coalesce(job.site_id, rule.site_id)
  left join public.service_catalogue service
    on service.id = coalesce(job.service_id, rule.service_id)
  where company.id = target_posting.company_id;
end;
$$;

revoke all on function public.posting_preview(text) from public;
grant execute on function public.posting_preview(text)
to anon, authenticated, service_role;

create function public.create_posting(
  target_company_id uuid,
  target_intent public.posting_intent,
  public_description text,
  target_job_id uuid default null,
  target_recurring_assignment_id uuid default null,
  posting_expires_at timestamptz default null,
  posting_application_cap integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code_length constant integer := 16;
  canonical_description text := btrim(coalesce(public_description, ''));
  random_bytes bytea;
  candidate_code text;
  attempt integer;
  byte_index integer;
  new_posting_id uuid;
begin
  perform 1
  from public.companies company
  where company.id = target_company_id
    and company.status = 'approved'
  for update;

  if not found or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if target_intent is null then
    raise check_violation using message = 'Posting intent is required';
  end if;
  if canonical_description = '' or char_length(canonical_description) > 2000 then
    raise check_violation using message = 'Public description must be between 1 and 2000 characters';
  end if;
  if posting_expires_at is not null and posting_expires_at <= now() then
    raise check_violation using message = 'Posting expiry must be in the future';
  end if;
  if posting_application_cap is not null and posting_application_cap <= 0 then
    raise check_violation using message = 'Application cap must be greater than zero';
  end if;

  if target_intent = 'expression_of_interest' then
    if target_job_id is not null or target_recurring_assignment_id is not null then
      raise check_violation using message = 'Expression-of-interest postings cannot bind work';
    end if;
  elsif target_intent = 'one_time' then
    if target_job_id is null or target_recurring_assignment_id is not null
      or not exists (
        select 1
        from public.vacancies vacancy
        join public.jobs job on job.id = vacancy.job_id
        where vacancy.job_id = target_job_id
          and vacancy.company_id = target_company_id
          and job.scheduled_start > now()
      ) then
      raise check_violation using message = 'One-time posting requires an unfilled future job';
    end if;
  elsif target_intent = 'regular' then
    if target_recurring_assignment_id is null or target_job_id is not null
      or not exists (
        select 1
        from public.recurring_assignments rule
        join public.sites site on site.id = rule.site_id
        join public.clients client on client.id = site.client_id
        where rule.id = target_recurring_assignment_id
          and client.company_id = target_company_id
          and rule.active
          and (
            select count(*)
            from public.recurring_assignment_cleaners named
            where named.recurring_assignment_id = rule.id
          ) < rule.crew_size
      ) then
      raise check_violation using message = 'Regular posting requires an unfilled active recurring assignment';
    end if;
  end if;

  for attempt in 1..10 loop
    begin
      random_bytes := extensions.gen_random_bytes(code_length);
      candidate_code := '';
      for byte_index in 0..(code_length - 1) loop
        candidate_code := candidate_code || substr(
          alphabet,
          (get_byte(random_bytes, byte_index) & 31) + 1,
          1
        );
      end loop;

      insert into public.postings (
        company_id,
        code,
        intent,
        public_description,
        job_id,
        recurring_assignment_id,
        expires_at,
        application_cap,
        created_by
      ) values (
        target_company_id,
        candidate_code,
        target_intent,
        canonical_description,
        target_job_id,
        target_recurring_assignment_id,
        posting_expires_at,
        posting_application_cap,
        auth.uid()
      )
      returning id into new_posting_id;

      return new_posting_id;
    exception when unique_violation then
      if attempt = 10 then
        raise unique_violation using message = 'Unable to generate a unique posting code';
      end if;
    end;
  end loop;

  raise unique_violation using message = 'Unable to generate a unique posting code';
end;
$$;

create function public.revoke_posting(target_posting_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_posting public.postings;
begin
  select posting.*
  into target_posting
  from public.postings posting
  where posting.id = target_posting_id
  for update;

  if not found or not public.is_company_admin(target_posting.company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  update public.postings
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where id = target_posting.id;
end;
$$;

create function public.validate_posting_application()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_posting public.postings;
  target_request public.join_requests;
begin
  if new.posting_id is null then
    if new.job_id is null or new.recurring_assignment_id is not null
      or new.join_request_id is not null then
      raise check_violation using message = 'Board application target is invalid';
    end if;
    return new;
  end if;

  select posting.* into target_posting
  from public.postings posting
  where posting.id = new.posting_id;

  if not found
    or new.job_id is distinct from target_posting.job_id
    or new.recurring_assignment_id is distinct from target_posting.recurring_assignment_id then
    raise check_violation using message = 'Application must use the posting work target';
  end if;

  if new.join_request_id is not null then
    select request.* into target_request
    from public.join_requests request
    where request.id = new.join_request_id;

    if not found
      or target_request.company_id <> target_posting.company_id
      or target_request.profile_id <> new.cleaner_id then
      raise check_violation using message = 'Application must belong to the posting join request';
    end if;
  elsif not exists (
    select 1
    from public.company_members membership
    where membership.company_id = target_posting.company_id
      and membership.profile_id = new.cleaner_id
      and membership.status = 'active'
  ) then
    raise check_violation using message = 'Board applicant must be on the cleaner staff';
  end if;

  return new;
end;
$$;

create trigger job_applications_validate_posting
before insert or update of posting_id, join_request_id, job_id,
  recurring_assignment_id, cleaner_id
on public.job_applications
for each row execute function public.validate_posting_application();

drop policy job_applications_select_participant on public.job_applications;
create policy job_applications_select_participant
on public.job_applications
for select
to authenticated
using (
  exists (
    select 1
    from public.postings posting
    where posting.id = job_applications.posting_id
      and public.is_company_admin(posting.company_id)
  )
  or exists (
    select 1
    from public.jobs job
    join public.sites site on site.id = job.site_id
    join public.clients client on client.id = site.client_id
    where job.id = job_applications.job_id
      and public.is_company_admin(client.company_id)
  )
  or (
    cleaner_id = auth.uid()
    and join_request_id is null
  )
);

create function public.apply_to_posting(
  posting_code text,
  full_name text,
  phone text,
  suburb text,
  note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  canonical_name text := btrim(coalesce(full_name, ''));
  canonical_phone text := btrim(coalesce(phone, ''));
  canonical_suburb text := btrim(coalesce(suburb, ''));
  canonical_note text := nullif(btrim(note), '');
  target_posting public.postings;
  target_request public.join_requests;
  application_id uuid;
  is_staff_cleaner boolean;
  violated_constraint text;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;
  if canonical_name = '' or canonical_phone = '' or canonical_suburb = '' then
    raise invalid_parameter_value using message = 'Full name, phone, and suburb are required';
  end if;
  if char_length(canonical_note) > 1000 then
    raise check_violation using message = 'Join request note must be at most 1000 characters';
  end if;

  perform 1 from public.profiles profile where profile.id = caller_id for update;
  if not found then
    raise insufficient_privilege using message = 'Sign in required';
  end if;

  select posting.* into target_posting
  from public.postings posting
  where posting.code = upper(btrim(posting_code))
  for update;

  if not found or public.posting_closing_reason(target_posting.id) is not null then
    raise check_violation using message = 'Posting is no longer active';
  end if;

  select exists (
    select 1
    from public.company_members membership
    where membership.company_id = target_posting.company_id
      and membership.profile_id = caller_id
      and membership.status = 'active'
  ) into is_staff_cleaner;

  if exists (
    select 1
    from public.company_members membership
    where membership.company_id = target_posting.company_id
      and membership.profile_id = caller_id
      and membership.status = 'removed'
  ) then
    raise insufficient_privilege using message = 'This company removed you from its cleaner staff';
  end if;

  update public.profiles
  set full_name = canonical_name, phone = canonical_phone, suburb = canonical_suburb
  where id = caller_id;

  if is_staff_cleaner then
    if target_posting.intent = 'expression_of_interest' then
      raise check_violation using message = 'Already on this company''s cleaner staff';
    end if;
    if target_posting.intent = 'regular' then
      raise check_violation using
        message = 'Regular posting applications are not available to existing cleaner staff';
    end if;

    insert into public.job_applications (
      job_id, recurring_assignment_id, cleaner_id, posting_id
    ) values (
      target_posting.job_id,
      target_posting.recurring_assignment_id,
      caller_id,
      target_posting.id
    )
    returning id into application_id;

    if target_posting.job_id is not null then
      insert into public.notifications (recipient_id, job_id, posting_id, type)
      select membership.profile_id, target_posting.job_id, target_posting.id,
        'application_received'
      from public.employee_memberships membership
      where membership.company_id = target_posting.company_id
        and membership.status = 'active';
    end if;

    return application_id;
  end if;

  select request.* into target_request
  from public.join_requests request
  where request.company_id = target_posting.company_id
    and request.profile_id = caller_id
  for update;

  if found and target_request.state = 'rejected' then
    raise insufficient_privilege using message = 'This company rejected your join request';
  end if;

  if not found then
    insert into public.join_requests (company_id, profile_id, note)
    values (target_posting.company_id, caller_id, canonical_note)
    returning * into target_request;
  end if;

  insert into public.job_applications (
    job_id,
    recurring_assignment_id,
    cleaner_id,
    posting_id,
    join_request_id
  ) values (
    target_posting.job_id,
    target_posting.recurring_assignment_id,
    caller_id,
    target_posting.id,
    target_request.id
  )
  returning id into application_id;

  return application_id;
exception when unique_violation then
  get stacked diagnostics violated_constraint = CONSTRAINT_NAME;
  if violated_constraint = 'job_applications_posting_cleaner_key'
    or exists (
      select 1
      from public.job_applications application
      where application.posting_id = target_posting.id
        and application.cleaner_id = caller_id
    ) then
    raise unique_violation using message = 'Person can apply only once per posting';
  elsif violated_constraint = 'job_applications_job_cleaner_key' then
    raise unique_violation using message = 'Cleaner can apply only once per job';
  elsif violated_constraint = 'job_applications_recurring_cleaner_key' then
    raise unique_violation using message = 'Cleaner can apply only once per recurring assignment';
  end if;
  raise;
end;
$$;

create function public.admit_join_request(target_join_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.join_requests;
  membership_id uuid;
begin
  select request.* into target_request
  from public.join_requests request
  where request.id = target_join_request_id
  for update;

  if not found or not public.is_company_admin(target_request.company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  insert into public.company_members (company_id, profile_id, status)
  values (target_request.company_id, target_request.profile_id, 'active')
  on conflict (company_id, profile_id) do update
  set status = 'active'
  returning id into membership_id;

  if target_request.state <> 'admitted' then
    update public.join_requests
    set state = 'admitted', decided_at = clock_timestamp()
    where id = target_request.id;

    insert into public.notifications (recipient_id, join_request_id, type)
    values (target_request.profile_id, target_request.id, 'admitted');
  end if;

  return membership_id;
end;
$$;

create function public.reject_join_request(target_join_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.join_requests;
  resolution_time timestamptz;
begin
  select request.* into target_request
  from public.join_requests request
  where request.id = target_join_request_id
  for update;

  if not found or not public.is_company_admin(target_request.company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;
  if target_request.state = 'rejected' then
    return;
  end if;
  if target_request.state <> 'waiting' then
    raise check_violation using message = 'Admitted join request cannot be rejected';
  end if;

  resolution_time := clock_timestamp();
  update public.join_requests
  set state = 'rejected', decided_at = resolution_time
  where id = target_request.id;

  update public.job_applications
  set status = 'withdrawn', resolved_at = resolution_time, withdrawn_at = resolution_time
  where join_request_id = target_request.id
    and status = 'applied';

  insert into public.notifications (recipient_id, join_request_id, type)
  values (target_request.profile_id, target_request.id, 'rejected');
end;
$$;

create function public.hire_posting_application(target_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_application public.job_applications;
  target_posting public.postings;
  target_request public.join_requests;
  target_job public.jobs;
  target_rule public.recurring_assignments;
  target_slot integer;
  result_id uuid;
  resolution_time timestamptz;
begin
  select application.* into target_application
  from public.job_applications application
  where application.id = target_application_id
  for update;

  if not found or target_application.posting_id is null
    or target_application.join_request_id is null then
    raise check_violation using message = 'Candidate application is no longer awaiting review';
  end if;

  select posting.* into target_posting
  from public.postings posting
  where posting.id = target_application.posting_id
  for update;

  if not found or not public.is_company_admin(target_posting.company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;
  if target_application.status <> 'applied' then
    raise check_violation using message = 'Candidate application is no longer awaiting review';
  end if;
  if target_posting.intent = 'expression_of_interest' then
    raise check_violation using message = 'Expression-of-interest applications can only be admitted';
  end if;

  select request.* into target_request
  from public.join_requests request
  where request.id = target_application.join_request_id
  for update;

  if not found or target_request.state = 'rejected' then
    raise check_violation using message = 'Candidate application is no longer awaiting review';
  end if;

  insert into public.company_members (company_id, profile_id, status)
  values (target_posting.company_id, target_application.cleaner_id, 'active')
  on conflict (company_id, profile_id) do update
  set status = 'active';

  resolution_time := clock_timestamp();

  if target_posting.intent = 'one_time' then
    select job.* into target_job
    from public.jobs job
    where job.id = target_posting.job_id
    for update;

    if not found or target_job.status not in ('draft', 'posted')
      or target_job.scheduled_start <= now()
      or (
        (select count(*) from public.job_assignments assignment
          where assignment.job_id = target_job.id and assignment.unassigned_at is null)
        +
        (select count(*) from public.offers offer
          where offer.job_id = target_job.id and offer.status = 'pending')
      ) >= target_job.crew_size then
      raise check_violation using message = 'No open slot is available';
    end if;

    select candidate.slot_number into target_slot
    from generate_series(1, target_job.crew_size) candidate(slot_number)
    where not exists (
      select 1 from public.job_assignments assignment
      where assignment.job_id = target_job.id
        and assignment.slot_number = candidate.slot_number
        and assignment.unassigned_at is null
    )
    order by candidate.slot_number
    limit 1;

    begin
      insert into public.job_assignments (
        job_id, slot_number, cleaner_id, source
      ) values (
        target_job.id, target_slot, target_application.cleaner_id, 'manual'
      )
      returning id into result_id;
    exception when exclusion_violation then
      raise check_violation using message = 'Cleaner is unavailable for this time';
    end;

    if (
      select count(*) from public.job_assignments assignment
      where assignment.job_id = target_job.id and assignment.unassigned_at is null
    ) = target_job.crew_size then
      update public.jobs set status = 'assigned' where id = target_job.id;

      update public.job_applications
      set status = 'not_selected', resolved_at = resolution_time
      where job_id = target_job.id
        and posting_id is null
        and status = 'applied';
    end if;

    insert into public.notifications (
      recipient_id, job_id, posting_id, join_request_id, type
    ) values (
      target_application.cleaner_id,
      target_job.id,
      target_posting.id,
      target_request.id,
      'hired'
    );
  else
    select rule.* into target_rule
    from public.recurring_assignments rule
    where rule.id = target_posting.recurring_assignment_id
    for update;

    select candidate.slot_number into target_slot
    from generate_series(1, target_rule.crew_size) candidate(slot_number)
    where not exists (
      select 1 from public.recurring_assignment_cleaners named
      where named.recurring_assignment_id = target_rule.id
        and named.slot_number = candidate.slot_number
    )
    order by candidate.slot_number
    limit 1;

    if not found or not target_rule.active then
      raise check_violation using message = 'No open slot is available';
    end if;

    insert into public.recurring_assignment_cleaners (
      recurring_assignment_id, slot_number, cleaner_id, accepted_at
    ) values (
      target_rule.id, target_slot, target_application.cleaner_id, resolution_time
    );

    update public.recurring_assignments
    set generation_version = generation_version + 1
    where id = target_rule.id;

    perform public.reconcile_recurring_assignment_jobs(target_rule.id, resolution_time);
    result_id := target_rule.id;

    insert into public.notifications (
      recipient_id, recurring_assignment_id, posting_id, join_request_id, type
    ) values (
      target_application.cleaner_id,
      target_rule.id,
      target_posting.id,
      target_request.id,
      'hired'
    );
  end if;

  update public.job_applications
  set status = 'hired', resolved_at = resolution_time, withdrawn_at = null
  where id = target_application.id;

  update public.join_requests
  set state = 'admitted', decided_at = resolution_time
  where id = target_request.id;

  return result_id;
end;
$$;

create view public.cleaner_join_request_state
with (security_invoker = false, security_barrier = true)
as
select
  request.id as join_request_id,
  request.company_id,
  company.name as company_name,
  request.state as join_request_state,
  request.note,
  request.created_at as requested_at,
  request.decided_at,
  application.id as application_id,
  application.posting_id,
  posting.intent,
  application.job_id,
  application.recurring_assignment_id,
  case
    when application.status = 'applied'
      and public.posting_closing_reason(posting.id) = 'filled'
      then 'job_filled'::public.application_status
    when application.status = 'applied'
      and public.posting_closing_reason(posting.id) is not null
      then 'posting_closed'::public.application_status
    else application.status
  end as application_state,
  application.applied_at,
  application.resolved_at
from public.join_requests request
join public.companies company on company.id = request.company_id
left join public.job_applications application on application.join_request_id = request.id
left join public.postings posting on posting.id = application.posting_id
where request.profile_id = auth.uid();

revoke all on table public.cleaner_join_request_state from public, anon, authenticated;
grant select on table public.cleaner_join_request_state to authenticated, service_role;

revoke all on function public.create_posting(
  uuid, public.posting_intent, text, uuid, uuid, timestamptz, integer
) from public, anon;
revoke all on function public.revoke_posting(uuid) from public, anon;
revoke all on function public.apply_to_posting(text, text, text, text, text)
from public, anon;
revoke all on function public.admit_join_request(uuid) from public, anon;
revoke all on function public.reject_join_request(uuid) from public, anon;
revoke all on function public.hire_posting_application(uuid) from public, anon;
revoke all on function public.validate_posting_application()
from public, anon, authenticated, service_role;

grant execute on function public.create_posting(
  uuid, public.posting_intent, text, uuid, uuid, timestamptz, integer
) to authenticated, service_role;
grant execute on function public.revoke_posting(uuid) to authenticated, service_role;
grant execute on function public.apply_to_posting(text, text, text, text, text)
to authenticated, service_role;
grant execute on function public.admit_join_request(uuid)
to authenticated, service_role;
grant execute on function public.reject_join_request(uuid)
to authenticated, service_role;
grant execute on function public.hire_posting_application(uuid)
to authenticated, service_role;

-- Retire the old rotating invitation capability without dropping its historical rows or
-- breaking the current app build before CLE-60/CLE-61 replace those screens. Every legacy
-- link is dead and every attempted rotation is a no-op that fails explicitly.
update public.company_invites
set revoked_at = coalesce(revoked_at, clock_timestamp())
where revoked_at is null;

create or replace function public.rotate_company_invite(target_company_id uuid)
returns public.company_invites
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.companies company
  where company.id = target_company_id
  for update;

  if not found or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  raise check_violation using message = 'Cleaner invitation rotation is retired';
end;
$$;

create or replace function public.cleaner_invite_preview(invite_code text)
returns table (state text, company_name text, pool_size integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.company_invites invite
    where invite.code = upper(btrim(invite_code))
  ) then
    return query select 'revoked'::text, null::text, 0;
  else
    return query select 'unknown'::text, null::text, 0;
  end if;
end;
$$;

create or replace function public.join_company_pool(
  invite_code text,
  full_name text,
  phone text,
  suburb text
)
returns table (joined_company_id uuid, joined_company_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;

  raise check_violation using message = 'Invite code is no longer active';
end;
$$;

revoke all on function public.rotate_company_invite(uuid) from public, anon;
grant execute on function public.rotate_company_invite(uuid)
to authenticated, service_role;
revoke all on function public.cleaner_invite_preview(text) from public;
grant execute on function public.cleaner_invite_preview(text)
to anon, authenticated, service_role;
revoke all on function public.join_company_pool(text, text, text, text)
from public, anon;
grant execute on function public.join_company_pool(text, text, text, text)
to authenticated, service_role;
