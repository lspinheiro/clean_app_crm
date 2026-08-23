drop view public.cleaner_pool_memberships;

create view public.cleaner_pool_memberships
with (security_invoker = false, security_barrier = true)
as
select
  membership.profile_id,
  membership.company_id,
  company.name as company_name,
  membership.status
from public.company_members membership
join public.companies company on company.id = membership.company_id
where membership.profile_id = auth.uid();

revoke all on table public.cleaner_pool_memberships from public, anon, authenticated;
grant select on table public.cleaner_pool_memberships to authenticated, service_role;

create function public.update_cleaner_profile(
  full_name text,
  phone text,
  suburb text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  trimmed_full_name text := btrim(coalesce(full_name, ''));
  trimmed_phone text := btrim(coalesce(phone, ''));
  trimmed_suburb text := btrim(coalesce(suburb, ''));
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;

  if trimmed_full_name = '' or trimmed_phone = '' or trimmed_suburb = '' then
    raise invalid_parameter_value using message = 'Full name, phone, and suburb are required';
  end if;

  update public.profiles profile
  set
    full_name = trimmed_full_name,
    phone = trimmed_phone,
    suburb = trimmed_suburb
  where profile.id = caller_id;

  if not found then
    raise insufficient_privilege using message = 'Profile access required';
  end if;
end;
$$;

revoke all on function public.update_cleaner_profile(text, text, text) from public, anon;
grant execute on function public.update_cleaner_profile(text, text, text)
  to authenticated, service_role;
