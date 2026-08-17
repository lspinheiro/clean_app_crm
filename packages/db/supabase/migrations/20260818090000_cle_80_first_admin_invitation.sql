create table public.first_admin_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null
    check (
      email = lower(btrim(email))
      and length(email) <= 320
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ),
  locale public.app_locale not null,
  invited_by text not null
    check (btrim(invited_by) <> '' and length(invited_by) <= 200),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  accepted_by_profile_id uuid references public.profiles (id) on delete restrict,
  company_id uuid references public.companies (id) on delete restrict,
  check (not (accepted_at is not null and revoked_at is not null)),
  check (
    (
      accepted_at is null
      and accepted_by_profile_id is null
      and company_id is null
    )
    or (
      accepted_at is not null
      and accepted_by_profile_id is not null
      and company_id is not null
    )
  )
);

create unique index first_admin_invitations_one_pending_email_idx
on public.first_admin_invitations (lower(email))
where accepted_at is null and revoked_at is null;

create index first_admin_invitations_email_created_idx
on public.first_admin_invitations (lower(email), created_at desc);

alter table public.first_admin_invitations enable row level security;

revoke all on table public.first_admin_invitations from anon, authenticated;
grant all on table public.first_admin_invitations to service_role;

create function public.prepare_first_admin_invitation(
  target_email text,
  target_locale public.app_locale,
  invited_by text,
  expires_at timestamptz
)
returns table (
  invitation_id uuid,
  created boolean,
  invitation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_email text := lower(btrim(target_email));
  canonical_invited_by text := btrim(invited_by);
begin
  if canonical_email = ''
    or length(canonical_email) > 320
    or canonical_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise invalid_parameter_value using message = 'A valid invitee e-mail is required';
  end if;

  if target_locale is null then
    raise invalid_parameter_value using message = 'Supported language required';
  end if;

  if canonical_invited_by = '' or length(canonical_invited_by) > 200 then
    raise invalid_parameter_value using message = 'The inviting operator is required';
  end if;

  if expires_at is null or expires_at <= now() then
    raise invalid_parameter_value using message = 'Invitation expiry must be in the future';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(canonical_email, 0)
  );

  select invitation.id, invitation.expires_at
  into invitation_id, invitation_expires_at
  from public.first_admin_invitations invitation
  where invitation.email = canonical_email
    and invitation.accepted_at is null
    and invitation.revoked_at is null
  for update;

  if invitation_id is not null and invitation_expires_at > now() then
    created := false;
    return next;
    return;
  end if;

  if invitation_id is not null then
    update public.first_admin_invitations invitation
    set revoked_at = now()
    where invitation.id = invitation_id;
  end if;

  insert into public.first_admin_invitations (
    email,
    locale,
    invited_by,
    expires_at
  )
  values (
    canonical_email,
    target_locale,
    canonical_invited_by,
    expires_at
  )
  returning id, first_admin_invitations.expires_at
  into invitation_id, invitation_expires_at;

  created := true;
  return next;
end;
$$;

create function public.revoke_first_admin_invitation(
  target_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.first_admin_invitations;
begin
  select candidate.*
  into invitation
  from public.first_admin_invitations candidate
  where candidate.id = target_invitation_id
  for update;

  if invitation.id is null then
    raise no_data_found using message = 'First-admin invitation not found';
  end if;

  if invitation.accepted_at is not null then
    raise invalid_parameter_value using message = 'Accepted invitation cannot be revoked';
  end if;

  if invitation.revoked_at is null then
    update public.first_admin_invitations candidate
    set revoked_at = now()
    where candidate.id = invitation.id;
  end if;
end;
$$;

create function public.get_first_admin_invitation_context()
returns table (
  invitation_status text,
  invitee_email text,
  locale public.app_locale,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select lower(btrim(auth_user.email)) as email
    from auth.users auth_user
    where auth_user.id = auth.uid()
      and auth_user.email_confirmed_at is not null
      and auth_user.email is not null
  )
  select
    case
      when invitation.accepted_at is not null then 'accepted'
      when invitation.revoked_at is not null then 'revoked'
      when invitation.expires_at <= now() then 'expired'
      else 'pending'
    end as invitation_status,
    invitation.email as invitee_email,
    invitation.locale,
    invitation.expires_at
  from public.first_admin_invitations invitation
  join caller on caller.email = invitation.email
  order by invitation.created_at desc, invitation.id desc
  limit 1
$$;

create function public.accept_first_admin_invitation(
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
  caller_role public.app_role;
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

  if canonical_full_name = '' then
    raise check_violation using message = 'Full name is required';
  end if;

  if length(canonical_full_name) > 120 then
    raise check_violation using message = 'Full name must be at most 120 characters';
  end if;

  if canonical_company_name = '' then
    raise check_violation using message = 'Company name is required';
  end if;

  if length(canonical_company_name) > 120 then
    raise check_violation using message = 'Company name must be at most 120 characters';
  end if;

  if canonical_company_abn !~ '^[0-9]{11}$' then
    raise check_violation using message = 'ABN must contain exactly 11 digits';
  end if;

  if canonical_contact_phone = '' then
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

  select profile.role
  into caller_role
  from public.profiles profile
  where profile.id = caller_id
  for update;

  if caller_role is null or caller_role <> 'cleaner'::public.app_role then
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

  if exists (
    select 1
    from public.company_members membership
    where membership.profile_id = caller_id
  ) then
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
    role = 'company_admin',
    full_name = canonical_full_name,
    phone = canonical_contact_phone,
    preferred_locale = target_locale
  where profile.id = caller_id;

  insert into public.company_members (
    company_id,
    profile_id,
    status
  )
  values (
    new_company_id,
    caller_id,
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

revoke all on function public.prepare_first_admin_invitation(
  text,
  public.app_locale,
  text,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.revoke_first_admin_invitation(uuid)
from public, anon, authenticated;
revoke all on function public.get_first_admin_invitation_context()
from public, anon;
revoke all on function public.accept_first_admin_invitation(
  text,
  text,
  text,
  text,
  public.app_locale
) from public, anon;

grant execute on function public.prepare_first_admin_invitation(
  text,
  public.app_locale,
  text,
  timestamptz
) to service_role;
grant execute on function public.revoke_first_admin_invitation(uuid)
to service_role;
grant execute on function public.get_first_admin_invitation_context()
to authenticated, service_role;
grant execute on function public.accept_first_admin_invitation(
  text,
  text,
  text,
  text,
  public.app_locale
) to authenticated, service_role;
