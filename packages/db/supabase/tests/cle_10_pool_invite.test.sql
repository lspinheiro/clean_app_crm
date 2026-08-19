begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select is(
  (
    select count(*)::integer
    from information_schema.routines
    where routine_schema = 'public' and routine_name = 'rotate_company_invite'
  ),
  1,
  'invite rotation exists as a narrow RPC'
);
select ok(
  (
    select position('extensions.gen_random_bytes' in pg_get_functiondef(procedure.oid)) > 0
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'rotate_company_invite'
  ),
  'invite codes use the cryptographic random-byte source'
);
select ok(
  (
    select position('for update' in lower(pg_get_functiondef(procedure.oid))) > 0
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'rotate_company_invite'
  ),
  'invite rotation locks the company before replacing its active code'
);
select ok(
  has_function_privilege('authenticated', 'public.rotate_company_invite(uuid)', 'EXECUTE'),
  'authenticated users can execute invite rotation subject to RPC authorisation'
);
select ok(
  not has_function_privilege('anon', 'public.rotate_company_invite(uuid)', 'EXECUTE'),
  'anonymous users cannot execute invite rotation'
);
select ok(
  has_function_privilege('service_role', 'public.rotate_company_invite(uuid)', 'EXECUTE'),
  'service role has an explicit invite rotation grant'
);
select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'company_invites'
      and indexname = 'company_invites_one_active_idx'
      and indexdef ilike '%where (revoked_at is null)%'
  ),
  1,
  'the baseline still enforces one active invite per company'
);

delete from public.company_invites;
insert into public.company_invites (company_id, code)
values ('10000000-0000-4000-8000-000000000010', 'ZTEST1');

select is(
  (
    select count(*)::integer
    from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null
  ),
  1,
  'the deterministic fixture starts with one active invite'
);
select results_eq(
  $$select code from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null$$,
  $$values ('ZTEST1'::text)$$,
  'the deterministic fixture exposes its active six-character code'
);
select is(
  (
    select count(*)::integer
    from public.company_members membership
    where membership.company_id = '10000000-0000-4000-8000-000000000010'
      and membership.status = 'active'
  ),
  3,
  'the demo pool contains exactly three active cleaners'
);
select results_eq(
  $$select
      profile.full_name,
      (membership.joined_at at time zone 'Australia/Brisbane')::date
    from public.company_members membership
    join public.profiles profile on profile.id = membership.profile_id
    where membership.company_id = '10000000-0000-4000-8000-000000000010'
      and membership.status = 'active'
    order by membership.joined_at$$,
  $$values
    ('Demo Cleaner One'::text, '2026-08-02'::date),
    ('Demo Cleaner Two'::text, '2026-08-03'::date),
    ('Demo Cleaner Three'::text, '2026-08-04'::date)$$,
  'the active pool carries stable member names and joined dates'
);
select is(
  (
    select count(*)::integer
    from public.company_members membership
    join public.profiles profile on profile.id = membership.profile_id
    where membership.company_id = '10000000-0000-4000-8000-000000000010'
      and membership.status = 'removed'
      and profile.full_name = 'Demo Removed Cleaner'
  ),
  1,
  'the demo fixture includes a removed cleaner outside the active pool'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'tenant-b-invite-admin@example.test',
  crypt('local-test-only', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Tenant B Invite Admin"}', now(), now(), '', '', '', ''
);
insert into public.companies (id, name, abn, status)
values ('20000000-0000-4000-8000-000000000010', 'Tenant B Invite Demo', '22222222222', 'approved');
insert into public.employee_memberships (company_id, profile_id, role)
values ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', 'owner');

create temp table cle_10_invite_state (
  state text primary key,
  code text not null
) on commit drop;
grant select, insert on table cle_10_invite_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.rotate_company_invite('10000000-0000-4000-8000-000000000010')$$,
  'company admin can generate a new active invite'
);
select is(
  (
    select count(*)::integer
    from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null
  ),
  1,
  'first rotation leaves exactly one active invite'
);
select ok(
  (
    select code <> 'ZTEST1' and code ~ '^[A-Z0-9]{6}$'
    from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null
  ),
  'first rotation produces a distinct six-character code'
);
select is(
  (
    select count(*)::integer
    from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and code = 'ZTEST1'
      and revoked_at is not null
  ),
  1,
  'first rotation retains and revokes the old invite row'
);
insert into cle_10_invite_state (state, code)
select 'first', code
from public.company_invites
where company_id = '10000000-0000-4000-8000-000000000010'
  and revoked_at is null;

select lives_ok(
  $$select public.rotate_company_invite('10000000-0000-4000-8000-000000000010')$$,
  'company admin can rotate the invite again'
);
select is(
  (
    select count(*)::integer
    from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null
  ),
  1,
  'second rotation also leaves exactly one active invite'
);
select is(
  (
    select count(*)::integer
    from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is not null
  ),
  2,
  'second rotation retains both superseded invite rows'
);
select ok(
  (
    select invite.code <> first_rotation.code and invite.code ~ '^[A-Z0-9]{6}$'
    from public.company_invites invite
    cross join cle_10_invite_state first_rotation
    where invite.company_id = '10000000-0000-4000-8000-000000000010'
      and invite.revoked_at is null
      and first_rotation.state = 'first'
  ),
  'second rotation produces another distinct valid code'
);
select is(
  (
    select count(*)::integer
    from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
  ),
  3,
  'two rotations preserve the complete three-row invite history'
);
select results_eq(
  $$select
      membership.profile_id,
      membership.status,
      (membership.joined_at at time zone 'Australia/Brisbane')::date
    from public.company_members membership
    where membership.company_id = '10000000-0000-4000-8000-000000000010'
      and membership.status = 'active'
    order by membership.joined_at$$,
  $$values
    ('10000000-0000-4000-8000-000000000002'::uuid, 'active'::public.member_status, '2026-08-02'::date),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'active'::public.member_status, '2026-08-03'::date),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'active'::public.member_status, '2026-08-04'::date)$$,
  'invite rotation leaves cleaner identities, status, and joined dates unchanged'
);
insert into cle_10_invite_state (state, code)
select 'second', code
from public.company_invites
where company_id = '10000000-0000-4000-8000-000000000010'
  and revoked_at is null;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.company_invites),
  0,
  'another company admin cannot read foreign invite history'
);
select throws_ok(
  $$select public.rotate_company_invite('10000000-0000-4000-8000-000000000010')$$,
  '42501',
  'Company admin access required',
  'another company admin cannot rotate the foreign invite'
);
reset role;
select results_eq(
  $$select code from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null$$,
  $$select code from cle_10_invite_state where state = 'second'$$,
  'a rejected foreign rotation leaves the active invite unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.company_invites),
  0,
  'cleaner cannot read raw company invites'
);
select throws_ok(
  $$select public.rotate_company_invite('10000000-0000-4000-8000-000000000010')$$,
  '42501',
  'Company admin access required',
  'cleaner cannot rotate the company invite'
);
reset role;
select results_eq(
  $$select code from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null$$,
  $$select code from cle_10_invite_state where state = 'second'$$,
  'a rejected cleaner rotation leaves the active invite unchanged'
);

create function public.cle_10_force_invite_collision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('cle_10.force_collision', true) = 'on' then
    raise unique_violation using message = 'Forced invite collision';
  end if;
  return new;
end;
$$;
create trigger cle_10_force_invite_collision
before insert on public.company_invites
for each row execute function public.cle_10_force_invite_collision();

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('cle_10.force_collision', 'on', true);
select throws_ok(
  $$select public.rotate_company_invite('10000000-0000-4000-8000-000000000010')$$,
  '23505',
  'Unable to generate a unique invite code',
  'exhausted invite-code collisions fail without completing a replacement'
);
reset role;
select results_eq(
  $$select code from public.company_invites
    where company_id = '10000000-0000-4000-8000-000000000010'
      and revoked_at is null$$,
  $$select code from cle_10_invite_state where state = 'second'$$,
  'a failed replacement rolls back revocation of the prior active invite'
);

drop trigger cle_10_force_invite_collision on public.company_invites;
drop function public.cle_10_force_invite_collision();

select * from finish();
rollback;
