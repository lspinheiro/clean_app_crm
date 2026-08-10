create type public.recurrence_frequency as enum ('weekly', 'fortnightly');

create table public.recurring_assignments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete restrict,
  service_id uuid not null references public.service_catalogue (id) on delete restrict,
  frequency public.recurrence_frequency not null,
  weekday smallint not null check (weekday between 1 and 7),
  anchor_date date not null,
  local_start_time time without time zone not null,
  duration_minutes integer not null check (duration_minutes > 0),
  cleaner_pay_cents integer not null check (cleaner_pay_cents > 0),
  crew_size integer not null check (crew_size >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(isodow from anchor_date)::smallint = weekday)
);

create table public.recurring_assignment_cleaners (
  recurring_assignment_id uuid not null
    references public.recurring_assignments (id) on delete cascade,
  slot_number integer not null check (slot_number >= 1),
  cleaner_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (recurring_assignment_id, slot_number),
  unique (recurring_assignment_id, cleaner_id)
);

create index recurring_assignments_site_idx
  on public.recurring_assignments (site_id, weekday, local_start_time);
create index recurring_assignments_active_idx
  on public.recurring_assignments (active, weekday)
  where active;
create index recurring_assignment_cleaners_cleaner_idx
  on public.recurring_assignment_cleaners (cleaner_id);

create trigger recurring_assignments_set_updated_at
before update on public.recurring_assignments
for each row execute function public.set_updated_at();

create function public.guard_recurring_assignment_crew_size()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.crew_size < old.crew_size
    and exists (
      select 1
      from public.recurring_assignment_cleaners named
      where named.recurring_assignment_id = old.id
        and named.slot_number > new.crew_size
    ) then
    raise check_violation using
      message = 'Crew size cannot exclude a named cleaner slot';
  end if;

  return new;
end;
$$;

create trigger recurring_assignments_guard_crew_size
before update of crew_size on public.recurring_assignments
for each row execute function public.guard_recurring_assignment_crew_size();

create function public.validate_recurring_assignment_cleaner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_rule public.recurring_assignments;
  target_company_id uuid;
begin
  select rule.*
  into target_rule
  from public.recurring_assignments rule
  where rule.id = new.recurring_assignment_id;

  if not found then
    raise foreign_key_violation using message = 'Recurring assignment not found';
  end if;

  if new.slot_number < 1 or new.slot_number > target_rule.crew_size then
    raise check_violation using
      message = 'Named cleaner slot must be between 1 and crew size';
  end if;

  select client.company_id
  into target_company_id
  from public.sites site
  join public.clients client on client.id = site.client_id
  where site.id = target_rule.site_id;

  if not exists (
    select 1
    from public.profiles profile
    join public.company_members membership on membership.profile_id = profile.id
    where profile.id = new.cleaner_id
      and profile.role = 'cleaner'
      and membership.company_id = target_company_id
      and membership.status = 'active'
  ) then
    raise check_violation using
      message = 'Named cleaners must be active pool members of the site company';
  end if;

  return new;
end;
$$;

create trigger recurring_assignment_cleaners_validate
before insert or update of recurring_assignment_id, slot_number, cleaner_id
on public.recurring_assignment_cleaners
for each row execute function public.validate_recurring_assignment_cleaner();

alter table public.recurring_assignments enable row level security;
alter table public.recurring_assignment_cleaners enable row level security;

create policy recurring_assignments_select_admin
on public.recurring_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.sites site
    join public.clients client on client.id = site.client_id
    where site.id = recurring_assignments.site_id
      and public.is_company_admin(client.company_id)
  )
);

create policy recurring_assignment_cleaners_select_admin
on public.recurring_assignment_cleaners
for select
to authenticated
using (
  exists (
    select 1
    from public.recurring_assignments rule
    join public.sites site on site.id = rule.site_id
    join public.clients client on client.id = site.client_id
    where rule.id = recurring_assignment_cleaners.recurring_assignment_id
      and public.is_company_admin(client.company_id)
  )
);

revoke all on table public.recurring_assignments from anon, authenticated;
revoke all on table public.recurring_assignment_cleaners from anon, authenticated;
grant select on table public.recurring_assignments to authenticated;
grant select on table public.recurring_assignment_cleaners to authenticated;
grant all on table public.recurring_assignments to service_role;
grant all on table public.recurring_assignment_cleaners to service_role;

create function public.create_recurring_assignment(
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
    raise check_violation using
      message = 'Named cleaner count cannot exceed crew size';
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
    site_id,
    service_id,
    frequency,
    weekday,
    anchor_date,
    local_start_time,
    duration_minutes,
    cleaner_pay_cents,
    crew_size
  ) values (
    target_site_id,
    target_service_id,
    target_frequency,
    target_weekday,
    target_anchor_date,
    target_local_start_time,
    target_duration_minutes,
    target_cleaner_pay_cents,
    target_crew_size
  )
  returning id into new_rule_id;

  insert into public.recurring_assignment_cleaners (
    recurring_assignment_id,
    slot_number,
    cleaner_id
  )
  select new_rule_id, cleaner.ordinality::integer, cleaner.cleaner_id
  from unnest(named_cleaner_ids) with ordinality as cleaner(cleaner_id, ordinality);

  return new_rule_id;
end;
$$;

create function public.update_recurring_assignment(
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
    raise check_violation using
      message = 'Named cleaner count cannot exceed crew size';
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
    crew_size = target_crew_size
  where id = target_recurring_assignment_id;

  insert into public.recurring_assignment_cleaners (
    recurring_assignment_id,
    slot_number,
    cleaner_id
  )
  select target_recurring_assignment_id, cleaner.ordinality::integer, cleaner.cleaner_id
  from unnest(named_cleaner_ids) with ordinality as cleaner(cleaner_id, ordinality);
end;
$$;

create function public.set_recurring_assignment_active(
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
  set active = target_active
  where id = target_recurring_assignment_id;
end;
$$;

revoke all on function public.create_recurring_assignment(
  uuid, uuid, public.recurrence_frequency, smallint, date,
  time without time zone, integer, integer, integer, uuid[]
) from public, anon;
revoke all on function public.update_recurring_assignment(
  uuid, uuid, public.recurrence_frequency, smallint, date,
  time without time zone, integer, integer, integer, uuid[]
) from public, anon;
revoke all on function public.set_recurring_assignment_active(uuid, boolean)
  from public, anon;

grant execute on function public.create_recurring_assignment(
  uuid, uuid, public.recurrence_frequency, smallint, date,
  time without time zone, integer, integer, integer, uuid[]
) to authenticated, service_role;
grant execute on function public.update_recurring_assignment(
  uuid, uuid, public.recurrence_frequency, smallint, date,
  time without time zone, integer, integer, integer, uuid[]
) to authenticated, service_role;
grant execute on function public.set_recurring_assignment_active(uuid, boolean)
  to authenticated, service_role;

revoke all on function public.guard_recurring_assignment_crew_size()
  from public, anon, authenticated;
revoke all on function public.validate_recurring_assignment_cleaner()
  from public, anon, authenticated;
