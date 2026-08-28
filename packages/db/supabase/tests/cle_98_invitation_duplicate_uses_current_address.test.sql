-- CLE-98 acceptance: the duplicate-employee refusal reads the address the employee signs in
-- with today, not the copy stored beside their profile.
--
-- `public.profiles.email` is written once, by `handle_new_auth_user`, which fires only
-- `after insert on auth.users`. Nothing refreshes it, so once someone changes their address the
-- stored copy is a record of who they used to be. Every other check in the invitation flow
-- already reads `auth.users` — delivery, preview, link claim, acceptance — and this one check
-- read the stale copy, so it answered about the wrong address in both directions:
--
--   * inviting the address the employee actually holds was allowed through, minting a second
--     offer to someone who is already on the team;
--   * inviting the address they gave up was refused as "already an employee", blocking an
--     address that now belongs to nobody — or to somebody else entirely.
begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into public.companies (id, name, abn, status)
values
  (
    '98000000-0000-4000-8000-000000000010',
    'CLE-98 Company',
    '98111111111',
    'approved'
  ),
  (
    '98000000-0000-4000-8000-000000000020',
    'CLE-98 Other Company',
    '98222222222',
    'approved'
  );

-- Every account is confirmed and holds a password, so nothing here turns on the CLE-94
-- usable-login rule; the only variable is which address the check consults.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  fixture.id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  fixture.email,
  extensions.crypt('local-test-only', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(), '', '', '', ''
from (values
  ('98000000-0000-4000-8000-000000000001'::uuid, 'owner@cle-98.example.test'),
  -- Signed up under one address and later moved to another. The sign-up trigger stored the
  -- first one on the profile and has no reason to fire again, so the two disagree from here on.
  ('98000000-0000-4000-8000-000000000002'::uuid, 'stale.stored@cle-98.example.test'),
  -- Never moved: the stored copy and the live address still agree, which is the ordinary case
  -- the refusal has always had to cover.
  ('98000000-0000-4000-8000-000000000003'::uuid, 'settled@cle-98.example.test'),
  -- Left the company. The membership is history, so the address is free to be offered again.
  ('98000000-0000-4000-8000-000000000004'::uuid, 'departed@cle-98.example.test'),
  -- On another company's team. Employment elsewhere is not this company's business.
  ('98000000-0000-4000-8000-000000000005'::uuid, 'elsewhere@cle-98.example.test')
) as fixture(id, email);

update auth.users
set email = 'current@cle-98.example.test'
where id = '98000000-0000-4000-8000-000000000002';

insert into public.employee_memberships (company_id, profile_id, role, status)
values
  (
    '98000000-0000-4000-8000-000000000010',
    '98000000-0000-4000-8000-000000000001',
    'owner',
    'active'
  ),
  (
    '98000000-0000-4000-8000-000000000010',
    '98000000-0000-4000-8000-000000000002',
    'staff',
    'active'
  ),
  (
    '98000000-0000-4000-8000-000000000010',
    '98000000-0000-4000-8000-000000000003',
    'staff',
    'active'
  ),
  (
    '98000000-0000-4000-8000-000000000010',
    '98000000-0000-4000-8000-000000000004',
    'staff',
    'removed'
  ),
  (
    '98000000-0000-4000-8000-000000000020',
    '98000000-0000-4000-8000-000000000005',
    'staff',
    'active'
  );

-- The fixture is only worth anything while the two addresses really do disagree, so it is
-- asserted rather than assumed. If a future change starts syncing the stored copy, these two
-- assertions fail loudly instead of the ones below quietly passing for the wrong reason.
select is(
  (select lower(btrim(profile.email))
   from public.profiles profile
   where profile.id = '98000000-0000-4000-8000-000000000002'),
  'stale.stored@cle-98.example.test',
  'the profile still stores the address the employee signed up with'
);

select is(
  (select lower(btrim(auth_user.email))
   from auth.users auth_user
   where auth_user.id = '98000000-0000-4000-8000-000000000002'),
  'current@cle-98.example.test',
  'the employee signs in with a different address today'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- The address this person actually holds is the one an owner would type, and it belongs to
-- someone already on the team.
select throws_ok(
  $$select public.prepare_employee_invitation(
      '98000000-0000-4000-8000-000000000010',
      'current@cle-98.example.test',
      'staff',
      'en-AU'
    )$$,
  '23505',
  'This account is already an employee',
  'the address an active employee signs in with is refused'
);

select is(
  (select count(*)::integer
   from public.employee_invitations
   where email = 'current@cle-98.example.test'),
  0,
  'no offer is recorded for an address that already belongs to an employee'
);

-- Case and surrounding space are normalised on the live address too, or the same person reads
-- as two different people depending on how the owner typed it.
select throws_ok(
  $$select public.prepare_employee_invitation(
      '98000000-0000-4000-8000-000000000010',
      '  CURRENT@CLE-98.Example.Test  ',
      'staff',
      'en-AU'
    )$$,
  '23505',
  'This account is already an employee',
  'the live address is matched regardless of case and surrounding space'
);

-- The address they gave up belongs to nobody. Refusing it would block an invitation the owner
-- is entitled to send.
select lives_ok(
  $$select public.prepare_employee_invitation(
      '98000000-0000-4000-8000-000000000010',
      'stale.stored@cle-98.example.test',
      'staff',
      'en-AU'
    )$$,
  'an address only the stale stored copy still names does not read as an employee'
);

select is(
  (select account_existed_at_invitation
   from public.employee_invitations
   where email = 'stale.stored@cle-98.example.test'),
  false,
  'the released address is treated as unknown, so the offer goes out as a first invitation'
);

-- The ordinary case, where the two addresses agree, still refuses.
select throws_ok(
  $$select public.prepare_employee_invitation(
      '98000000-0000-4000-8000-000000000010',
      'settled@cle-98.example.test',
      'staff',
      'en-AU'
    )$$,
  '23505',
  'This account is already an employee',
  'an employee who never changed address is still refused'
);

-- The refusal stays scoped: only an active membership at this company blocks an offer.
select lives_ok(
  $$select public.prepare_employee_invitation(
      '98000000-0000-4000-8000-000000000010',
      'departed@cle-98.example.test',
      'staff',
      'en-AU'
    )$$,
  'someone whose membership has been removed can be invited back'
);

select lives_ok(
  $$select public.prepare_employee_invitation(
      '98000000-0000-4000-8000-000000000010',
      'elsewhere@cle-98.example.test',
      'staff',
      'en-AU'
    )$$,
  'an active employee of another company can be invited here'
);

reset role;

select * from finish();

rollback;
