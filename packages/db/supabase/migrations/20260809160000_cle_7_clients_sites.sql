create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  contact_name text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  address text not null check (btrim(address) <> ''),
  suburb text not null check (btrim(suburb) <> ''),
  access_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_company_name_idx on public.clients (company_id, name);
create index sites_client_name_idx on public.sites (client_id, name);

create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create trigger sites_set_updated_at
before update on public.sites
for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
alter table public.sites enable row level security;

create policy clients_select_admin
on public.clients
for select
to authenticated
using (public.is_company_admin(company_id));

create policy sites_select_admin
on public.sites
for select
to authenticated
using (
  exists (
    select 1
    from public.clients client
    where client.id = sites.client_id
      and public.is_company_admin(client.company_id)
  )
);

revoke all on table public.clients from anon, authenticated;
revoke all on table public.sites from anon, authenticated;
grant select on table public.clients to authenticated;
grant select on table public.sites to authenticated;
grant all on table public.clients to service_role;
grant all on table public.sites to service_role;

create function public.create_client(
  target_company_id uuid,
  client_name text,
  client_contact_name text default null,
  client_phone text default null,
  client_notes text default null
)
returns public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_client public.clients;
begin
  if not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if btrim(client_name) = '' then
    raise check_violation using message = 'Client name is required';
  end if;

  insert into public.clients (
    company_id,
    name,
    contact_name,
    phone,
    notes
  )
  values (
    target_company_id,
    btrim(client_name),
    nullif(btrim(client_contact_name), ''),
    nullif(btrim(client_phone), ''),
    nullif(btrim(client_notes), '')
  )
  returning * into created_client;

  return created_client;
end;
$$;

create function public.create_site(
  target_client_id uuid,
  site_name text,
  site_address text,
  site_suburb text,
  site_access_notes text default null
)
returns public.sites
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  created_site public.sites;
begin
  select client.company_id
  into target_company_id
  from public.clients client
  where client.id = target_client_id;

  if target_company_id is null or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if btrim(site_name) = '' or btrim(site_address) = '' or btrim(site_suburb) = '' then
    raise check_violation using message = 'Site name, address, and suburb are required';
  end if;

  insert into public.sites (
    client_id,
    name,
    address,
    suburb,
    access_notes
  )
  values (
    target_client_id,
    btrim(site_name),
    btrim(site_address),
    btrim(site_suburb),
    nullif(btrim(site_access_notes), '')
  )
  returning * into created_site;

  return created_site;
end;
$$;

revoke all on function public.create_client(uuid, text, text, text, text) from public, anon;
revoke all on function public.create_site(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_client(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.create_site(uuid, text, text, text, text) to authenticated, service_role;
