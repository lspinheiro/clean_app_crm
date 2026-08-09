create table public.service_catalogue (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null unique check (btrim(name) <> ''),
  sort_order integer not null unique check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.service_catalogue (id, slug, name, sort_order)
values
  ('30000000-0000-4000-8000-000000000001', 'office-clean', 'Office clean', 10),
  ('30000000-0000-4000-8000-000000000002', 'standard-clean', 'Standard clean', 20),
  ('30000000-0000-4000-8000-000000000003', 'deep-clean', 'Deep clean', 30),
  ('30000000-0000-4000-8000-000000000004', 'end-of-lease-clean', 'End-of-lease clean', 40);

alter table public.sites
  add column default_service_id uuid references public.service_catalogue (id),
  add column default_duration_minutes integer,
  add column default_rate_cents integer,
  add constraint sites_defaults_all_or_none check (
    (
      default_service_id is null
      and default_duration_minutes is null
      and default_rate_cents is null
    )
    or (
      default_service_id is not null
      and default_duration_minutes is not null
      and default_rate_cents is not null
      and default_duration_minutes > 0
      and default_rate_cents > 0
    )
  );

alter table public.service_catalogue enable row level security;

create policy service_catalogue_select_authenticated
on public.service_catalogue
for select
to authenticated
using (true);

revoke all on table public.service_catalogue from anon, authenticated;
grant select on table public.service_catalogue to authenticated;
grant all on table public.service_catalogue to service_role;

create function public.update_client(
  target_client_id uuid,
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
  target_company_id uuid;
  updated_client public.clients;
begin
  select client.company_id
  into target_company_id
  from public.clients client
  where client.id = target_client_id;

  if target_company_id is null or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if btrim(client_name) = '' then
    raise check_violation using message = 'Client name is required';
  end if;

  update public.clients
  set
    name = btrim(client_name),
    contact_name = nullif(btrim(client_contact_name), ''),
    phone = nullif(btrim(client_phone), ''),
    notes = nullif(btrim(client_notes), '')
  where id = target_client_id
  returning * into updated_client;

  return updated_client;
end;
$$;

create function public.update_site(
  target_site_id uuid,
  site_name text,
  site_address text,
  site_suburb text,
  site_access_notes text,
  site_default_service_id uuid,
  site_default_duration_minutes integer,
  site_default_rate_cents integer
)
returns public.sites
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  updated_site public.sites;
begin
  select client.company_id
  into target_company_id
  from public.sites site
  join public.clients client on client.id = site.client_id
  where site.id = target_site_id;

  if target_company_id is null or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if btrim(site_name) = '' or btrim(site_address) = '' or btrim(site_suburb) = '' then
    raise check_violation using message = 'Site name, address, and suburb are required';
  end if;

  if site_default_duration_minutes <= 0 or site_default_rate_cents <= 0 then
    raise check_violation using message = 'Site duration and rate must be greater than zero';
  end if;

  if not exists (
    select 1
    from public.service_catalogue service
    where service.id = site_default_service_id
      and service.active
  ) then
    raise foreign_key_violation using message = 'Active service not found';
  end if;

  update public.sites
  set
    name = btrim(site_name),
    address = btrim(site_address),
    suburb = btrim(site_suburb),
    access_notes = nullif(btrim(site_access_notes), ''),
    default_service_id = site_default_service_id,
    default_duration_minutes = site_default_duration_minutes,
    default_rate_cents = site_default_rate_cents
  where id = target_site_id
  returning * into updated_site;

  return updated_site;
end;
$$;

revoke all on function public.update_client(uuid, text, text, text, text) from public, anon;
revoke all on function public.update_site(uuid, text, text, text, text, uuid, integer, integer) from public, anon;
grant execute on function public.update_client(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.update_site(uuid, text, text, text, text, uuid, integer, integer) to authenticated, service_role;
