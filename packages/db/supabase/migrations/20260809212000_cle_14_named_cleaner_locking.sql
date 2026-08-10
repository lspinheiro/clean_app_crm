create or replace function public.validate_recurring_assignment_cleaner()
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
  where rule.id = new.recurring_assignment_id
  for update of rule;

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

  perform 1
  from public.profiles profile
  join public.company_members membership on membership.profile_id = profile.id
  where profile.id = new.cleaner_id
    and profile.role = 'cleaner'
    and membership.company_id = target_company_id
    and membership.status = 'active'
  for share of profile, membership;

  if not found then
    raise check_violation using
      message = 'Named cleaners must be active pool members of the site company';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_recurring_assignment_cleaner()
  from public, anon, authenticated;
