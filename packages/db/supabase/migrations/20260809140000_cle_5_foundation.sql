create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('company_admin', 'cleaner', 'admin');
create type public.company_status as enum ('pending', 'approved', 'suspended');
create type public.member_status as enum ('active', 'removed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'cleaner',
  full_name text not null check (btrim(full_name) <> ''),
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  abn text not null check (abn ~ '^[0-9]{11}$'),
  logo_path text,
  timezone text not null default 'Australia/Brisbane'
    check (timezone = 'Australia/Brisbane'),
  status public.company_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  unique (company_id, profile_id)
);

create table public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index company_members_profile_idx on public.company_members (profile_id);
create index company_invites_company_created_idx
  on public.company_invites (company_id, created_at desc);
create unique index company_invites_one_active_idx
  on public.company_invites (company_id)
  where revoked_at is null;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    'cleaner',
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'New cleaner'),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
$$;

create function public.is_company_admin(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.company_members cm on cm.profile_id = p.id
    join public.companies c on c.id = cm.company_id
    where p.id = auth.uid()
      and p.role = 'company_admin'
      and cm.company_id = target_company_id
      and cm.status = 'active'
      and c.status = 'approved'
  )
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.company_invites enable row level security;

create policy profiles_select_self_or_company_pool
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.company_members subject_membership
    where subject_membership.profile_id = profiles.id
      and subject_membership.status = 'active'
      and public.is_company_admin(subject_membership.company_id)
  )
);

create policy companies_select_admin
on public.companies
for select
to authenticated
using (public.is_company_admin(id));

create policy companies_update_admin
on public.companies
for update
to authenticated
using (public.is_company_admin(id))
with check (public.is_company_admin(id));

create policy company_members_select_admin
on public.company_members
for select
to authenticated
using (public.is_company_admin(company_id));

create policy company_invites_select_admin
on public.company_invites
for select
to authenticated
using (public.is_company_admin(company_id));

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.companies from anon, authenticated;
revoke all on table public.company_members from anon, authenticated;
revoke all on table public.company_invites from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select, update on table public.companies to authenticated;
grant select on table public.company_members to authenticated;
grant select on table public.company_invites to authenticated;

grant all on table public.profiles to service_role;
grant all on table public.companies to service_role;
grant all on table public.company_members to service_role;
grant all on table public.company_invites to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.current_app_role() from public, anon;
revoke all on function public.is_company_admin(uuid) from public, anon;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.is_company_admin(uuid) to authenticated, service_role;
