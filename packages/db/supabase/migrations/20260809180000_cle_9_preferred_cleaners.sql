create table public.site_preferred_cleaners (
  site_id uuid not null references public.sites (id) on delete cascade,
  cleaner_id uuid not null references public.profiles (id) on delete restrict,
  rank integer not null check (rank >= 1),
  created_at timestamptz not null default now(),
  primary key (site_id, cleaner_id),
  unique (site_id, rank)
);

create index site_preferred_cleaners_cleaner_idx
  on public.site_preferred_cleaners (cleaner_id);

alter table public.site_preferred_cleaners enable row level security;

create policy site_preferred_cleaners_select_admin
on public.site_preferred_cleaners
for select
to authenticated
using (
  exists (
    select 1
    from public.sites site
    join public.clients client on client.id = site.client_id
    where site.id = site_preferred_cleaners.site_id
      and public.is_company_admin(client.company_id)
  )
);

revoke all on table public.site_preferred_cleaners from anon, authenticated;
grant select on table public.site_preferred_cleaners to authenticated;
grant all on table public.site_preferred_cleaners to service_role;

create function public.set_site_preferred_cleaners(
  target_site_id uuid,
  cleaner_ids uuid[]
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
  from public.sites site
  join public.clients client on client.id = site.client_id
  where site.id = target_site_id
  for update of site;

  if target_company_id is null or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  if cleaner_ids is null then
    raise check_violation using message = 'Preferred cleaner list is required';
  end if;

  if exists (select 1 from unnest(cleaner_ids) requested(cleaner_id) where requested.cleaner_id is null) then
    raise check_violation using message = 'Preferred cleaner list cannot contain null';
  end if;

  if cardinality(cleaner_ids) <> (
    select count(distinct requested.cleaner_id)
    from unnest(cleaner_ids) requested(cleaner_id)
  ) then
    raise unique_violation using message = 'Preferred cleaner list cannot contain duplicates';
  end if;

  if exists (
    select 1
    from unnest(cleaner_ids) requested(cleaner_id)
    left join public.profiles profile on profile.id = requested.cleaner_id
    where profile.id is null
      or profile.role <> 'cleaner'
      or not exists (
        select 1
        from public.company_members membership
        where membership.company_id = target_company_id
          and membership.profile_id = requested.cleaner_id
          and membership.status = 'active'
      )
  ) then
    raise check_violation using message = 'Every preferred cleaner must be an active pool cleaner';
  end if;

  delete from public.site_preferred_cleaners preference
  where preference.site_id = target_site_id;

  insert into public.site_preferred_cleaners (site_id, cleaner_id, rank)
  select target_site_id, requested.cleaner_id, requested.ordinality::integer
  from unnest(cleaner_ids) with ordinality requested(cleaner_id, ordinality);
end;
$$;

revoke all on function public.set_site_preferred_cleaners(uuid, uuid[]) from public, anon;
grant execute on function public.set_site_preferred_cleaners(uuid, uuid[]) to authenticated, service_role;
