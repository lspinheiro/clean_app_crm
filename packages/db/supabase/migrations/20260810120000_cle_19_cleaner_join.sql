alter table public.profiles add column suburb text;

-- Read before the cleaner has an account: the join link must name the company that sent it.
-- Returns the company name and an aggregate pool size only — never member identities.
create function public.cleaner_invite_preview(invite_code text)
returns table (state text, company_name text, pool_size integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  invite public.company_invites;
  company public.companies;
begin
  select * into invite
  from public.company_invites
  where code = upper(btrim(invite_code));

  if not found then
    return query select 'unknown'::text, null::text, 0;
    return;
  end if;

  select * into company
  from public.companies
  where id = invite.company_id;

  return query
  select
    (case
      when invite.revoked_at is not null then 'revoked'
      when invite.expires_at is not null and invite.expires_at <= now() then 'expired'
      else 'active'
    end)::text,
    company.name,
    (
      select count(*)::integer
      from public.company_members membership
      join public.profiles profile on profile.id = membership.profile_id
      where membership.company_id = company.id
        and membership.status = 'active'
        and profile.role = 'cleaner'
    );
end;
$$;

-- One atomic step: record the registration details and join the pool.
create function public.join_company_pool(
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
  if not found or caller.role <> 'cleaner' then
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

  select * into existing
  from public.company_members
  where company_id = invite.company_id
    and profile_id = cleaner_id;

  -- Removal is a company-admin decision; an old link must not undo it.
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

revoke all on function public.cleaner_invite_preview(text) from public;
grant execute on function public.cleaner_invite_preview(text)
  to anon, authenticated, service_role;

revoke all on function public.join_company_pool(text, text, text, text) from public, anon;
grant execute on function public.join_company_pool(text, text, text, text)
  to authenticated, service_role;
