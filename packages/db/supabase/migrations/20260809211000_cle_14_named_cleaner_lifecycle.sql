create function public.open_recurring_slots_for_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or (
      old.status = 'active'
      and (
        new.status <> 'active'
        or new.company_id is distinct from old.company_id
        or new.profile_id is distinct from old.profile_id
      )
    ) then
    delete from public.recurring_assignment_cleaners named
    using
      public.recurring_assignments rule,
      public.sites site,
      public.clients client
    where named.recurring_assignment_id = rule.id
      and rule.site_id = site.id
      and site.client_id = client.id
      and client.company_id = old.company_id
      and named.cleaner_id = old.profile_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger company_members_open_recurring_slots
after update of status, company_id, profile_id or delete
on public.company_members
for each row execute function public.open_recurring_slots_for_membership_change();

create function public.open_recurring_slots_for_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or (old.role = 'cleaner' and new.role <> 'cleaner') then
    delete from public.recurring_assignment_cleaners
    where cleaner_id = old.id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_open_recurring_slots
before update of role or delete
on public.profiles
for each row execute function public.open_recurring_slots_for_profile_change();

revoke all on function public.open_recurring_slots_for_membership_change()
  from public, anon, authenticated;
revoke all on function public.open_recurring_slots_for_profile_change()
  from public, anon, authenticated;
