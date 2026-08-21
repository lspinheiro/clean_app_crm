create type public.employee_role as enum ('owner', 'staff');

create table public.employee_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.employee_role not null,
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  unique (company_id, profile_id)
);

create index employee_memberships_profile_idx
on public.employee_memberships (profile_id);

alter table public.employee_memberships enable row level security;

revoke all on table public.employee_memberships from anon, authenticated;
grant select on table public.employee_memberships to authenticated;
grant all on table public.employee_memberships to service_role;

-- Preserve every delivered company-side relationship while separating pool membership.
insert into public.employee_memberships (
  company_id,
  profile_id,
  role,
  status,
  joined_at
)
select
  membership.company_id,
  membership.profile_id,
  'owner'::public.employee_role,
  membership.status,
  membership.joined_at
from public.company_members membership
join public.profiles profile on profile.id = membership.profile_id
where profile.role = 'company_admin';

delete from public.company_members membership
using public.profiles profile
where profile.id = membership.profile_id
  and profile.role = 'company_admin';

create function public.is_company_employee(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employee_memberships membership
    join public.companies company on company.id = membership.company_id
    where membership.profile_id = auth.uid()
      and membership.company_id = target_company_id
      and membership.status = 'active'
      and company.status = 'approved'
  )
$$;

create function public.is_company_owner(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employee_memberships membership
    join public.companies company on company.id = membership.company_id
    where membership.profile_id = auth.uid()
      and membership.company_id = target_company_id
      and membership.role = 'owner'
      and membership.status = 'active'
      and company.status = 'approved'
  )
$$;

create or replace function public.is_company_admin(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_company_employee(target_company_id)
$$;

create policy employee_memberships_select_self_or_owner
on public.employee_memberships
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_company_owner(company_id)
);

revoke all on function public.is_company_employee(uuid) from public, anon;
revoke all on function public.is_company_owner(uuid) from public, anon;
grant execute on function public.is_company_employee(uuid) to authenticated, service_role;
grant execute on function public.is_company_owner(uuid) to authenticated, service_role;

create view public.cleaner_pool_memberships
with (security_invoker = false, security_barrier = true)
as
select
  membership.profile_id,
  membership.status
from public.company_members membership
where membership.profile_id = auth.uid();

revoke all on table public.cleaner_pool_memberships from public, anon, authenticated;
grant select on table public.cleaner_pool_memberships to authenticated, service_role;

-- The delivered operational functions already use is_company_admin. Its implementation now
-- means active owner or staff membership. Cleaner checks become pool-membership checks because
-- company_members contains only pool memberships after this migration.
do $$
declare
  routine record;
  definition text;
begin
  for routine in
    select procedure.oid
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname not in (
        'accept_first_admin_invitation',
        'current_app_role',
        'open_recurring_slots_for_profile_change'
      )
      and (
        procedure.prosrc like '%profile.role%'
        or procedure.prosrc like '%caller.role%'
      )
    order by procedure.oid
  loop
    definition := pg_catalog.pg_get_functiondef(routine.oid);
    definition := pg_catalog.replace(
      definition,
      'and profile.role = ''cleaner''',
      ''
    );
    definition := pg_catalog.replace(
      definition,
      'or profile.role <> ''cleaner''',
      ''
    );
    definition := pg_catalog.replace(
      definition,
      'if not found or caller.role <> ''cleaner'' then',
      'if not found then'
    );

    if definition like '%profile.role%'
      or definition like '%caller.role%' then
      raise exception 'Unhandled global role check in function oid %', routine.oid;
    end if;

    execute definition;
  end loop;
end;
$$;

-- An employee may join another company's pool, but not the pool of the company they administer.
-- This preserves the existing same-company boundary without relying on an account-wide role.
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
declare
  cleaner_id uuid := auth.uid();
  trimmed_name text := btrim(coalesce(full_name, ''));
  trimmed_phone text := btrim(coalesce(phone, ''));
  trimmed_suburb text := btrim(coalesce(suburb, ''));
  caller public.profiles;
  invite public.company_invites;
  existing public.company_members;
  company public.companies;
begin
  if cleaner_id is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;

  if trimmed_name = '' or trimmed_phone = '' or trimmed_suburb = '' then
    raise invalid_parameter_value using message = 'Full name, phone, and suburb are required';
  end if;

  select * into caller from public.profiles where id = cleaner_id;
  if not found then
    raise insufficient_privilege using message = 'Cleaner access required';
  end if;

  select * into invite
  from public.company_invites
  where code = upper(btrim(invite_code))
  for update;

  if not found then
    raise invalid_parameter_value using message = 'Invite code not found';
  end if;
  if invite.revoked_at is not null then
    raise invalid_parameter_value using message = 'Invite code is no longer active';
  end if;
  if invite.expires_at is not null and invite.expires_at <= now() then
    raise invalid_parameter_value using message = 'Invite code has expired';
  end if;

  if exists (
    select 1
    from public.employee_memberships membership
    where membership.company_id = invite.company_id
      and membership.profile_id = cleaner_id
      and membership.status = 'active'
  ) then
    raise insufficient_privilege using message = 'Cleaner access required';
  end if;

  select * into existing
  from public.company_members
  where company_id = invite.company_id
    and profile_id = cleaner_id;

  if found and existing.status = 'removed' then
    raise insufficient_privilege using message = 'This company removed you from their pool';
  end if;

  update public.profiles
  set full_name = trimmed_name,
      phone = trimmed_phone,
      suburb = trimmed_suburb
  where id = cleaner_id;

  insert into public.company_members (company_id, profile_id)
  values (invite.company_id, cleaner_id)
  on conflict (company_id, profile_id) do nothing;

  select * into company from public.companies where id = invite.company_id;

  return query select company.id, company.name;
end;
$$;

do $$
declare
  target_view record;
  definition text;
begin
  for target_view in
    select relation.oid, relation.relname
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('cleaner_job_board', 'cleaner_my_jobs')
    order by relation.relname
  loop
    definition := pg_catalog.replace(
      pg_catalog.pg_get_viewdef(target_view.oid, true),
      'profile.role = ''cleaner''::app_role AND ',
      ''
    );
    execute pg_catalog.format(
      'create or replace view public.%I with (security_invoker = false, security_barrier = true) as %s',
      target_view.relname,
      definition
    );
  end loop;
end;
$$;

-- Company identity is owner-only; staff retain every operational capability.
do $$
declare
  routine record;
  definition text;
begin
  for routine in
    select procedure.oid
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'can_manage_company_logo',
        'can_upload_reserved_company_logo',
        'reserve_company_logo_upload',
        'update_company_identity'
      )
    order by procedure.oid
  loop
    definition := pg_catalog.replace(
      pg_catalog.pg_get_functiondef(routine.oid),
      'public.is_company_admin',
      'public.is_company_owner'
    );
    execute definition;
  end loop;
end;
$$;

drop trigger profiles_open_recurring_slots on public.profiles;
drop function public.open_recurring_slots_for_profile_change();
drop function public.current_app_role();

alter table public.profiles drop column role;
drop type public.app_role;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    preferred_locale
  )
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      'New cleaner'
    ),
    new.email,
    case new.raw_user_meta_data ->> 'preferred_locale'
      when 'en-AU' then 'en-AU'::public.app_locale
      when 'pt-BR' then 'pt-BR'::public.app_locale
      else null
    end
  );
  return new;
end;
$$;

create or replace function public.accept_first_admin_invitation(
  full_name text,
  company_name text,
  company_abn text,
  contact_phone text,
  target_locale public.app_locale
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  canonical_full_name text := btrim(full_name);
  canonical_company_name text := btrim(company_name);
  canonical_company_abn text := regexp_replace(company_abn, '[[:space:]]', '', 'g');
  canonical_contact_phone text := btrim(contact_phone);
  invitation_id uuid;
  new_company_id uuid;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;

  if canonical_full_name is null or canonical_full_name = '' then
    raise check_violation using message = 'Full name is required';
  end if;

  if length(canonical_full_name) > 120 then
    raise check_violation using message = 'Full name must be at most 120 characters';
  end if;

  if canonical_company_name is null or canonical_company_name = '' then
    raise check_violation using message = 'Company name is required';
  end if;

  if length(canonical_company_name) > 120 then
    raise check_violation using message = 'Company name must be at most 120 characters';
  end if;

  if canonical_company_abn is null or canonical_company_abn !~ '^[0-9]{11}$' then
    raise check_violation using message = 'ABN must contain exactly 11 digits';
  end if;

  if canonical_contact_phone is null or canonical_contact_phone = '' then
    raise check_violation using message = 'Contact phone is required';
  end if;

  if length(canonical_contact_phone) > 40 then
    raise check_violation using message = 'Contact phone must be at most 40 characters';
  end if;

  if target_locale is null then
    raise invalid_parameter_value using message = 'Supported language required';
  end if;

  select lower(btrim(auth_user.email))
  into caller_email
  from auth.users auth_user
  where auth_user.id = caller_id
    and auth_user.email_confirmed_at is not null
    and auth_user.email is not null;

  if caller_email is null then
    raise invalid_authorization_specification
      using message = 'Invitation is no longer available';
  end if;

  perform 1
  from public.profiles profile
  where profile.id = caller_id
  for update;

  if not found then
    raise invalid_authorization_specification
      using message = 'Invitation is no longer available';
  end if;

  select invitation.id
  into invitation_id
  from public.first_admin_invitations invitation
  where invitation.email = caller_email
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > now()
  for update;

  if invitation_id is null then
    raise invalid_authorization_specification
      using message = 'Invitation is no longer available';
  end if;

  insert into public.companies (
    name,
    abn,
    status
  )
  values (
    canonical_company_name,
    canonical_company_abn,
    'approved'
  )
  returning id into new_company_id;

  update public.profiles profile
  set
    full_name = canonical_full_name,
    phone = canonical_contact_phone,
    preferred_locale = target_locale
  where profile.id = caller_id;

  insert into public.employee_memberships (
    company_id,
    profile_id,
    role,
    status
  )
  values (
    new_company_id,
    caller_id,
    'owner',
    'active'
  );

  update public.first_admin_invitations invitation
  set
    accepted_at = now(),
    accepted_by_profile_id = caller_id,
    company_id = new_company_id
  where invitation.id = invitation_id;

  return new_company_id;
end;
$$;

create function public.protect_last_company_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removes_active_owner boolean;
begin
  -- Cascading removal from the company row deletes the tenant itself, so there is no
  -- surviving company whose owner invariant must be protected.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  removes_active_owner := old.role = 'owner'
    and old.status = 'active'
    and (
      tg_op = 'DELETE'
      or new.role <> 'owner'
      or new.status <> 'active'
      or new.company_id is distinct from old.company_id
    );

  if not removes_active_owner then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  perform 1
  from public.companies company
  where company.id = old.company_id
  for update;

  if not exists (
    select 1
    from public.employee_memberships membership
    where membership.company_id = old.company_id
      and membership.id <> old.id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise check_violation using
      message = 'Company must retain at least one active owner';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger employee_memberships_protect_last_owner
before update of company_id, role, status or delete
on public.employee_memberships
for each row execute function public.protect_last_company_owner();

revoke all on function public.protect_last_company_owner()
from public, anon, authenticated, service_role;
