alter table public.profiles
add column last_active_company uuid
references public.companies (id)
on delete set null;

grant select on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

create function public.set_active_company(target_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or target_company_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.employee_memberships membership
    join public.companies company on company.id = membership.company_id
    where membership.profile_id = caller_id
      and membership.company_id = target_company_id
      and membership.status = 'active'
      and company.status = 'approved'
  ) then
    return null;
  end if;

  update public.profiles
  set last_active_company = target_company_id
  where id = caller_id;

  if not found then
    return null;
  end if;

  return target_company_id;
end;
$$;

revoke all on function public.set_active_company(uuid) from public, anon;
grant execute on function public.set_active_company(uuid) to authenticated, service_role;
