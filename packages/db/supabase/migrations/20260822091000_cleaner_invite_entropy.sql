-- The cleaner invite code is a bearer capability: whoever holds it can enrol as a
-- cleaner in the company and read that company's job board. Six base-32 characters
-- is a 2^30 code space, and the anonymous preview tells a caller whether a guess is
-- live — enough to make online enumeration of an active code realistic. Widen the
-- code to sixteen characters (2^80) and stop the preview from naming the company for
-- codes that cannot be used.
--
-- The code travels in the join link, never typed from memory, so length costs the
-- cleaner nothing.

-- Existing six-character codes are rotated out rather than grandfathered: they were
-- issued from the small code space and cannot be made stronger in place. Admins
-- create a new invitation from the Cleaners page.
update public.company_invites
set revoked_at = now()
where revoked_at is null
  and char_length(code) < 16;

alter table public.company_invites
  drop constraint company_invites_code_check;

-- Revoked rows keep their historical codes; anything still usable must carry the
-- full sixteen characters.
alter table public.company_invites
  add constraint company_invites_code_check
    check (
      code ~ '^[A-Z0-9]+$'
      and (char_length(code) >= 16 or revoked_at is not null)
    );

create or replace function public.rotate_company_invite(target_company_id uuid)
returns public.company_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code_length constant integer := 16;
  attempt integer;
  byte_index integer;
  candidate_code text;
  random_bytes bytea;
  new_invite public.company_invites;
begin
  perform 1
  from public.companies company
  where company.id = target_company_id
  for update;

  if not found or not public.is_company_admin(target_company_id) then
    raise insufficient_privilege using message = 'Company admin access required';
  end if;

  for attempt in 1..10 loop
    begin
      random_bytes := extensions.gen_random_bytes(code_length);
      candidate_code := '';

      for byte_index in 0..(code_length - 1) loop
        candidate_code := candidate_code || substr(
          alphabet,
          (get_byte(random_bytes, byte_index) & 31) + 1,
          1
        );
      end loop;

      update public.company_invites invite
      set revoked_at = now()
      where invite.company_id = target_company_id
        and invite.revoked_at is null;

      insert into public.company_invites (company_id, code)
      values (target_company_id, candidate_code)
      returning * into new_invite;

      return new_invite;
    exception
      when unique_violation then
        if attempt = 10 then
          raise unique_violation using message = 'Unable to generate a unique invite code';
        end if;
    end;
  end loop;

  raise unique_violation using message = 'Unable to generate a unique invite code';
end;
$$;

-- The preview still has to name the company for a live link — that is the whole
-- point of the join screen — but a revoked or expired code no longer discloses which
-- tenant it belonged to, and neither does an unknown one.
create or replace function public.cleaner_invite_preview(invite_code text)
returns table (state text, company_name text, pool_size integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  invite public.company_invites;
  invite_state text;
begin
  select * into invite
  from public.company_invites
  where code = upper(btrim(invite_code));

  if not found then
    return query select 'unknown'::text, null::text, 0;
    return;
  end if;

  invite_state := case
    when invite.revoked_at is not null then 'revoked'
    when invite.expires_at is not null and invite.expires_at <= now() then 'expired'
    else 'active'
  end;

  if invite_state <> 'active' then
    return query select invite_state, null::text, 0;
    return;
  end if;

  return query
  select
    invite_state,
    company.name,
    (
      select count(*)::integer
      from public.company_members membership
      where membership.company_id = company.id
        and membership.status = 'active'
    )
  from public.companies company
  where company.id = invite.company_id;
end;
$$;

revoke all on function public.rotate_company_invite(uuid) from public, anon;
grant execute on function public.rotate_company_invite(uuid) to authenticated, service_role;

revoke all on function public.cleaner_invite_preview(text) from public;
grant execute on function public.cleaner_invite_preview(text)
  to anon, authenticated, service_role;
