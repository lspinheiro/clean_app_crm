-- CLE-100 acceptance: the e-mail can name the company and the person who sent the invitation
-- even when nobody is signed in.
--
-- The invitee requests a fresh link from a page with no session, so the delivery cannot ask a
-- session anything. The invitation row already records the company and the inviter; this reads
-- them, together with the invitee's auth record, which is what a recovery e-mail needs before
-- it can say either name.
begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select has_function(
  'public',
  'employee_invitation_delivery_details',
  array['uuid'],
  'delivery can look up what the e-mail has to say'
);

select is_definer(
  'public',
  'employee_invitation_delivery_details',
  array['uuid'],
  'it reads auth records, so it runs with its owner''s rights'
);

-- The answer says whether an address has an auth record. The invitation preview is masked so
-- that holding a link id cannot be used to ask that question; this must not become the way.
select ok(
  not has_function_privilege(
    'anon',
    'public.employee_invitation_delivery_details(uuid)',
    'EXECUTE'
  ),
  'an anonymous caller cannot ask whether an address has an account'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.employee_invitation_delivery_details(uuid)',
    'EXECUTE'
  ),
  'nor can an arbitrary signed-in account'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.employee_invitation_delivery_details(uuid)',
    'EXECUTE'
  ),
  'the server action that sends the e-mail can'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  (
    'c1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'owner@cle100.test',
    extensions.crypt('local-test-only', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    pg_catalog.jsonb_build_object('full_name', 'Robin Owner'),
    now(), now(), '', '', '', ''
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'registered@cle100.test',
    extensions.crypt('local-test-only', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    pg_catalog.jsonb_build_object('full_name', 'Registered Invitee'),
    now(), now(), '', '', '', ''
  );

insert into public.companies (id, name, abn, status)
values ('c1000000-0000-4000-8000-000000000010', 'CLE-100 Cleaning', '10000000001', 'approved');

insert into public.employee_memberships (id, company_id, profile_id, role, status)
values (
  'c1000000-0000-4000-8000-000000000091',
  'c1000000-0000-4000-8000-000000000010',
  'c1000000-0000-4000-8000-000000000001',
  'owner', 'active'
);

insert into public.employee_invitations (
  id, company_id, email, role, locale, invited_by_profile_id,
  account_existed_at_invitation, expires_at
) values
  (
    'c1000000-0000-4000-8000-000000000201',
    'c1000000-0000-4000-8000-000000000010',
    'registered@cle100.test', 'staff', 'en-AU',
    'c1000000-0000-4000-8000-000000000001',
    true, now() + interval '7 days'
  ),
  (
    'c1000000-0000-4000-8000-000000000202',
    'c1000000-0000-4000-8000-000000000010',
    'stranger@cle100.test', 'staff', 'pt-BR',
    'c1000000-0000-4000-8000-000000000001',
    false, now() + interval '7 days'
  );

set local role service_role;

-- ---------------------------------------------------------------------------
-- What the e-mail needs, without a session to ask
-- ---------------------------------------------------------------------------

select results_eq(
  $$select company_name, inviter_name, invitee_user_id
      from public.employee_invitation_delivery_details(
        'c1000000-0000-4000-8000-000000000201'
      )$$,
  $$values (
      'CLE-100 Cleaning'::text,
      'Robin Owner'::text,
      'c1000000-0000-4000-8000-000000000002'::uuid
    )$$,
  'a registered invitee yields the company, the inviter, and the account to describe'
);

-- An invitation to an address nobody has registered still has both names to say; there is
-- simply no account yet to write them onto, and `inviteUserByEmail` carries them instead.
select results_eq(
  $$select company_name, inviter_name, invitee_user_id
      from public.employee_invitation_delivery_details(
        'c1000000-0000-4000-8000-000000000202'
      )$$,
  $$values ('CLE-100 Cleaning'::text, 'Robin Owner'::text, null::uuid)$$,
  'an unregistered invitee yields the names and no account'
);

select is(
  (
    select count(*)::integer
    from public.employee_invitation_delivery_details(
      'c1000000-0000-4000-8000-0000000002ff'
    )
  ),
  0,
  'an id that matches nothing is empty rather than raising'
);

-- The inviter is the person, not the company: renaming the owner renames the sender.
select lives_ok(
  $$update public.profiles set full_name = 'Robin the Owner'
    where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'the fixture renames the inviter'
);

select is(
  (
    select inviter_name from public.employee_invitation_delivery_details(
      'c1000000-0000-4000-8000-000000000201'
    )
  ),
  'Robin the Owner'::text,
  'the name comes from the inviter''s profile rather than a copy taken at invitation time'
);

reset role;

select * from finish();

rollback;
