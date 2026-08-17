create type public.app_locale as enum ('en-AU', 'pt-BR');

alter table public.profiles
add column preferred_locale public.app_locale;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    role,
    full_name,
    email,
    preferred_locale
  )
  values (
    new.id,
    'cleaner',
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      'New cleaner'
    ),
    new.email,
    case new.raw_user_meta_data ->> 'preferred_locale'
      when 'en-AU' then 'en-AU'::public.app_locale
      when 'pt-BR' then 'pt-BR'::public.app_locale
      else null
    end
  );

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user()
from public, anon, authenticated;

create function public.set_preferred_locale(
  target_locale public.app_locale
)
returns public.app_locale
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  stored_locale public.app_locale;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Sign in required';
  end if;

  if target_locale is null then
    raise invalid_parameter_value using message = 'Supported language required';
  end if;

  select profile.preferred_locale
  into stored_locale
  from public.profiles profile
  where profile.id = caller_id
  for update;

  if not found then
    raise no_data_found using message = 'Profile not found';
  end if;

  if stored_locale is distinct from target_locale then
    update public.profiles
    set preferred_locale = target_locale
    where id = caller_id;
  end if;

  return target_locale;
end;
$$;

revoke all on function public.set_preferred_locale(public.app_locale)
from public, anon;

grant execute on function public.set_preferred_locale(public.app_locale)
to authenticated, service_role;
