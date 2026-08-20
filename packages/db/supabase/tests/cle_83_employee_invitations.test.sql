begin;

create extension if not exists pgtap with schema extensions;

select plan(45);

select has_table(
  'public',
  'employee_invitations',
  'employee invitation state belongs to the application'
);

select has_column(
  'public',
  'employee_invitations',
  'superseded_at',
  'expired invitations can be superseded without changing their displayed lifecycle state'
);

select columns_are(
  'public',
  'employee_invitations',
  array[
    'id',
    'company_id',
    'email',
    'role',
    'locale',
    'invited_by_profile_id',
    'account_existed_at_invitation',
    'expires_at',
    'created_at',
    'accepted_at',
    'revoked_at',
    'superseded_at',
    'accepted_by_profile_id'
  ],
  'employee invitations retain role, inviter, account path, lifecycle, and acceptance identity'
);

select has_function(
  'public',
  'prepare_employee_invitation',
  array['uuid', 'text', 'public.employee_role', 'public.app_locale'],
  'owners prepare an employee invitation through one RPC'
);

select has_function(
  'public',
  'get_employee_invitation_context',
  array['uuid'],
  'invitees read one e-mail-matched invitation context through an RPC'
);

select has_function(
  'public',
  'accept_employee_invitation',
  array['uuid', 'text', 'public.app_locale'],
  'employee acceptance is one atomic RPC'
);

select has_function(
  'public',
  'revoke_employee_invitation',
  array['uuid', 'uuid'],
  'owners revoke one pending employee invitation through an RPC'
);

select has_view(
  'public',
  'employee_invitation_states',
  'owners read the current invitation lifecycle through a company-scoped view'
);

select ok(
  coalesce(
    has_table_privilege('authenticated', 'public.employee_invitation_states', 'SELECT'),
    false
  ),
  'authenticated owners have an explicit invitation-state view grant'
);

select ok(
  coalesce(
    has_table_privilege('service_role', 'public.employee_invitation_states', 'SELECT'),
    false
  ),
  'service role has an explicit invitation-state view grant'
);

select is_definer(
  'public',
  'prepare_employee_invitation',
  array['uuid', 'text', 'public.employee_role', 'public.app_locale'],
  'employee invitation preparation owns its write'
);

select is_definer(
  'public',
  'accept_employee_invitation',
  array['uuid', 'text', 'public.app_locale'],
  'employee invitation acceptance owns its membership write'
);

select results_eq(
  $$select relrowsecurity from pg_catalog.pg_class
    where oid = pg_catalog.to_regclass('public.employee_invitations')$$,
  array[true],
  'employee invitations enforce RLS'
);

select ok(
  coalesce(
    has_table_privilege('authenticated', 'public.employee_invitations', 'SELECT'),
    false
  ),
  'authenticated owners have an explicit invitation read grant'
);

select ok(
  not coalesce(
    has_table_privilege('authenticated', 'public.employee_invitations', 'INSERT,UPDATE,DELETE'),
    false
  ),
  'authenticated accounts cannot mutate invitations directly'
);

select ok(
  coalesce(
    has_table_privilege(
      'service_role',
      'public.employee_invitations',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
    false
  ),
  'service role has explicit employee-invitation DML grants'
);

select function_privs_are(
  'public',
  'prepare_employee_invitation',
  array['uuid', 'text', 'public.employee_role', 'public.app_locale'],
  'anon',
  array[]::text[],
  'anonymous callers cannot prepare employee invitations'
);

select function_privs_are(
  'public',
  'prepare_employee_invitation',
  array['uuid', 'text', 'public.employee_role', 'public.app_locale'],
  'authenticated',
  array['EXECUTE'],
  'authenticated owners receive the narrow preparation capability'
);

select function_privs_are(
  'public',
  'accept_employee_invitation',
  array['uuid', 'text', 'public.app_locale'],
  'authenticated',
  array['EXECUTE'],
  'authenticated invitees receive the narrow acceptance capability'
);

select lives_ok(
  $$insert into auth.users (
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
      pg_catalog.jsonb_build_object('full_name', fixture.full_name),
      now(), now(), '', '', '', ''
    from (values
      ('83000000-0000-4000-8000-000000000001'::uuid, 'owner@cle-83.example.test', 'CLE-83 Owner'),
      ('83000000-0000-4000-8000-000000000002'::uuid, 'staff@cle-83.example.test', 'CLE-83 Staff'),
      ('83000000-0000-4000-8000-000000000003'::uuid, 'cleaner@cle-83.example.test', 'CLE-83 Existing Cleaner'),
      ('83000000-0000-4000-8000-000000000004'::uuid, 'revoked@cle-83.example.test', 'CLE-83 Revoked'),
      ('83000000-0000-4000-8000-000000000005'::uuid, 'expired@cle-83.example.test', 'CLE-83 Expired'),
      ('83000000-0000-4000-8000-000000000006'::uuid, 'removed@cle-83.example.test', 'CLE-83 Removed')
    ) as fixture(id, email, full_name);

    insert into public.companies (id, name, abn, status)
    values
      ('83000000-0000-4000-8000-000000000010', 'CLE-83 Company', '83111111111', 'approved'),
      ('83000000-0000-4000-8000-000000000020', 'CLE-83 Other Company', '83222222222', 'approved');

    insert into public.employee_memberships (company_id, profile_id, role, status)
    values
      ('83000000-0000-4000-8000-000000000010', '83000000-0000-4000-8000-000000000001', 'owner', 'active'),
      ('83000000-0000-4000-8000-000000000010', '83000000-0000-4000-8000-000000000002', 'staff', 'active'),
      ('83000000-0000-4000-8000-000000000010', '83000000-0000-4000-8000-000000000006', 'owner', 'removed');

    insert into public.company_members (company_id, profile_id, status)
    values (
      '83000000-0000-4000-8000-000000000010',
      '83000000-0000-4000-8000-000000000003',
      'active'
    )$$,
  'S32 fixtures keep an existing cleaner login alongside company employee identities'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.prepare_employee_invitation(
      '83000000-0000-4000-8000-000000000010',
      ' CLEANER@cle-83.example.test ',
      'staff',
      'en-AU'
    )$$,
  'an active owner can invite an existing account as staff'
);

select results_eq(
  $$select
      email::text collate "C",
      role::text collate "C",
      locale::text collate "C",
      account_existed_at_invitation,
      expires_at > now() + interval '6 days 23 hours',
      expires_at <= now() + interval '7 days 1 minute'
    from public.employee_invitations
    where company_id = '83000000-0000-4000-8000-000000000010'
      and email = 'cleaner@cle-83.example.test'$$,
  $$values (
    'cleaner@cle-83.example.test'::text collate "C",
    'staff'::text collate "C",
    'en-AU'::text collate "C",
    true,
    true,
    true
  )$$,
  'the owner choice and fixed seven-day lifetime persist on the invitation'
);

select lives_ok(
  $$select public.prepare_employee_invitation(
      '83000000-0000-4000-8000-000000000010',
      'future-owner@cle-83.example.test',
      'owner',
      'pt-BR'
    )$$,
  'an owner can choose the owner role for a new e-mail'
);

select results_eq(
  $$select role::text collate "C", account_existed_at_invitation
    from public.employee_invitations
    where email = 'future-owner@cle-83.example.test'$$,
  $$values ('owner'::text collate "C", false)$$,
  'a new e-mail remains an application invitation and does not create an account or membership'
);

reset role;
select lives_ok(
  $$insert into public.employee_invitations (
      id, company_id, email, role, locale, invited_by_profile_id,
      account_existed_at_invitation, expires_at, revoked_at
    ) values
      (
        '83000000-0000-4000-8000-000000000701',
        '83000000-0000-4000-8000-000000000010',
        'revoked@cle-83.example.test',
        'staff',
        'en-AU',
        '83000000-0000-4000-8000-000000000001',
        true,
        now() + interval '7 days',
        now()
      ),
      (
        '83000000-0000-4000-8000-000000000702',
        '83000000-0000-4000-8000-000000000010',
        'expired@cle-83.example.test',
        'owner',
        'pt-BR',
        '83000000-0000-4000-8000-000000000001',
        true,
        now() - interval '1 second',
        null
      )$$,
  'revoked and expired invitation fixtures persist independently'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select (case
      when accepted_at is not null then 'accepted'
      when revoked_at is not null then 'revoked'
      when expires_at <= now() then 'expired'
      else 'pending'
    end)::text collate "C" as invitation_state
    from public.employee_invitations
    where company_id = '83000000-0000-4000-8000-000000000010'
    order by 1$$,
  $$values
    ('expired'::text collate "C"),
    ('pending'::text collate "C"),
    ('pending'::text collate "C"),
    ('revoked'::text collate "C")$$,
  'the owner can read pending, expired, and revoked invitation states before acceptance'
);

select lives_ok(
  $$select public.prepare_employee_invitation(
      '83000000-0000-4000-8000-000000000010',
      'expired@cle-83.example.test',
      'staff',
      'en-AU'
    )$$,
  'an owner can issue a new invitation after the prior one expires'
);

select results_eq(
  $$select (to_jsonb(invitation)->>'superseded_at') is not null
    from public.employee_invitations invitation
    where invitation.id = '83000000-0000-4000-8000-000000000702'$$,
  array[true],
  'the lapsed invitation is superseded under the preparation lock'
);

select results_eq(
  $$select invitation_state::text collate "C"
    from public.employee_invitation_states
    where id = '83000000-0000-4000-8000-000000000702'$$,
  $$values ('expired'::text collate "C")$$,
  'a superseded lapsed invitation remains visible as expired'
);

select results_eq(
  $$select
      count(*)::integer,
      count(*) filter (
        where accepted_at is null
          and revoked_at is null
          and (to_jsonb(invitation)->>'superseded_at') is null
      )::integer
    from public.employee_invitations invitation
    where company_id = '83000000-0000-4000-8000-000000000010'
      and email = 'expired@cle-83.example.test'$$,
  $$values (2, 1)$$,
  're-inviting keeps one current invitation while retaining expired history'
);

reset role;
update public.employee_invitations
set expires_at = now() + interval '7 days'
where id = '83000000-0000-4000-8000-000000000702';

set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.accept_employee_invitation(
      '83000000-0000-4000-8000-000000000702',
      'CLE-83 Expired',
      'pt-BR'
    )$$,
  '22023',
  'Invitation is no longer available',
  'a superseded invitation stays unacceptable even if its expiry is later advanced'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.revoke_employee_invitation(
      (select id from public.employee_invitations
       where email = 'future-owner@cle-83.example.test'),
      '83000000-0000-4000-8000-000000000010'
    )$$,
  'an owner can revoke a pending invitation'
);

select results_eq(
  $$select revoked_at is not null
    from public.employee_invitations
    where email = 'future-owner@cle-83.example.test'$$,
  array[true],
  'revocation is visible in the invitation lifecycle'
);

reset role;
update public.employee_invitations
set id = '83000000-0000-4000-8000-000000000700'
where email = 'cleaner@cle-83.example.test';

set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.prepare_employee_invitation(
      '83000000-0000-4000-8000-000000000010',
      'blocked@cle-83.example.test',
      'staff',
      'en-AU'
    )$$,
  '42501',
  'Company owner access required',
  'staff cannot prepare an employee invitation even with a direct RPC call'
);

select is(
  (select count(*)::integer from public.employee_invitations),
  0,
  'staff cannot read employee invitations under RLS'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select
      invitation_status::text collate "C",
      company_name::text collate "C",
      role::text collate "C",
      account_existed_at_invitation
    from public.get_employee_invitation_context(
      '83000000-0000-4000-8000-000000000700'
    )$$,
  $$values (
    'pending'::text collate "C",
    'CLE-83 Company'::text collate "C",
    'staff'::text collate "C",
    true
  )$$,
  'an existing account sees only its e-mail-matched invitation and chosen role'
);

select lives_ok(
  $$select public.accept_employee_invitation(
      '83000000-0000-4000-8000-000000000700',
      'CLE-83 Existing Cleaner',
      'pt-BR'
    )$$,
  'the existing account accepts through one atomic membership mutation'
);

reset role;
select results_eq(
  $$select
      membership.role::text collate "C",
      membership.status::text collate "C",
      invitation.accepted_at is not null,
      invitation.accepted_by_profile_id = membership.profile_id
    from public.employee_invitations invitation
    join public.employee_memberships membership
      on membership.company_id = invitation.company_id
      and membership.profile_id = invitation.accepted_by_profile_id
    where invitation.email = 'cleaner@cle-83.example.test'$$,
  $$values (
    'staff'::text collate "C",
    'active'::text collate "C",
    true,
    true
  )$$,
  'acceptance creates exactly the chosen active employee membership and consumes the invitation'
);

select is(
  (select count(*)::integer
   from public.company_members
   where profile_id = '83000000-0000-4000-8000-000000000003'),
  1,
  'acceptance keeps the existing cleaner pool membership on the same login'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.accept_employee_invitation(
      '83000000-0000-4000-8000-000000000701',
      'CLE-83 Revoked',
      'en-AU'
    )$$,
  '22023',
  'Invitation is no longer available',
  'a revoked invitation cannot be accepted'
);

select throws_ok(
  $$select public.accept_employee_invitation(
      '83000000-0000-4000-8000-000000000702',
      'CLE-83 Expired',
      'pt-BR'
    )$$,
  '22023',
  'Invitation is no longer available',
  'an expired invitation cannot be accepted'
);

select throws_ok(
  $$select public.accept_employee_invitation(
      '83000000-0000-4000-8000-000000000700',
      'CLE-83 Existing Cleaner',
      'pt-BR'
    )$$,
  '22023',
  'Invitation is no longer available',
  'an accepted invitation cannot be accepted twice'
);

reset role;

insert into public.employee_invitations (
  id, company_id, email, role, locale, invited_by_profile_id,
  account_existed_at_invitation, expires_at
) values (
  '83000000-0000-4000-8000-000000000703',
  '83000000-0000-4000-8000-000000000010',
  'removed@cle-83.example.test',
  'staff',
  'en-AU',
  '83000000-0000-4000-8000-000000000001',
  true,
  now() + interval '7 days'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.accept_employee_invitation(
      '83000000-0000-4000-8000-000000000703',
      'CLE-83 Removed',
      'en-AU'
    )$$,
  'a removed employee can accept a new invitation without a unique-membership failure'
);

reset role;
select results_eq(
  $$select role::text collate "C", status::text collate "C"
    from public.employee_memberships
    where company_id = '83000000-0000-4000-8000-000000000010'
      and profile_id = '83000000-0000-4000-8000-000000000006'$$,
  $$values ('staff'::text collate "C", 'active'::text collate "C")$$,
  're-acceptance reactivates the retained membership with the newly invited role'
);

reset role;

select is(
  (select count(*)::integer
   from public.companies
   where id not in (
     '83000000-0000-4000-8000-000000000010',
     '83000000-0000-4000-8000-000000000020'
   )
   and name like 'CLE-83%'),
  0,
  'employee acceptance never creates a company or another first owner source'
);

select * from finish();
rollback;
