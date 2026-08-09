create function public.rotate_company_invite(target_company_id uuid)
returns public.company_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
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
      random_bytes := extensions.gen_random_bytes(6);
      candidate_code := '';

      for byte_index in 0..5 loop
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

revoke all on function public.rotate_company_invite(uuid) from public, anon;
grant execute on function public.rotate_company_invite(uuid) to authenticated, service_role;
