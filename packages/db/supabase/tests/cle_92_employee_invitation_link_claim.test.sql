-- CLE-92 acceptance: an invitee can ask for a fresh link without an admin.
--
-- The invitation record lives seven days, but the auth token in the e-mail is single-use and
-- dies on the first GET — a link scanner, a prefetch or a reload spends it. Until now that
-- ended the journey, because `prepare_employee_invitation` refuses while an invitation is
-- open and the only recourse was revoke-and-reinvite, which mints a new id and orphans the
-- link already sitting in the invitee's inbox.
--
-- Claiming is one statement so two taps cannot both send, and it carries the project's own
-- `smtp_max_frequency` of sixty seconds rather than trusting the caller to wait.
begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_function(
  'public',
  'claim_employee_invitation_link',
  array['uuid'],
  'an invitee can claim a fresh link for a live invitation'
);

select is_definer(
  'public',
  'claim_employee_invitation_link',
  array['uuid'],
  'the claim reads and writes with its owner''s rights'
);

-- The invitee has no session, so the server action mediates with the service role. Opening
-- this to anon would let anyone with a link id spend somebody else's e-mail allowance.
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_employee_invitation_link(uuid)',
    'EXECUTE'
  ),
  'an anonymous caller cannot make the project send e-mail'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_employee_invitation_link(uuid)',
    'EXECUTE'
  ),
  'nor can an arbitrary signed-in account'
);

select has_column(
  'public',
  'employee_invitations',
  'last_link_sent_at',
  'the invitation remembers when a link last went out'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values (
  '92000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'owner@cle92.test',
  extensions.crypt('local-test-only', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  pg_catalog.jsonb_build_object('full_name', 'CLE-92 Owner'),
  now(), now(), '', '', '', ''
);

insert into public.companies (id, name, abn, status)
values ('92000000-0000-4000-8000-000000000010', 'CLE-92 Company', '92000000001', 'approved');

insert into public.employee_memberships (id, company_id, profile_id, role, status)
values (
  '92000000-0000-4000-8000-000000000091',
  '92000000-0000-4000-8000-000000000010',
  '92000000-0000-4000-8000-000000000001',
  'owner', 'active'
);

insert into public.employee_invitations (
  id, company_id, email, role, locale, invited_by_profile_id,
  account_existed_at_invitation, expires_at, accepted_at, accepted_by_profile_id, revoked_at
) values
  (
    '92000000-0000-4000-8000-000000000201',
    '92000000-0000-4000-8000-000000000010',
    'live@cle92.test', 'staff', 'pt-BR',
    '92000000-0000-4000-8000-000000000001',
    false, now() + interval '7 days', null, null, null
  ),
  (
    '92000000-0000-4000-8000-000000000202',
    '92000000-0000-4000-8000-000000000010',
    'revoked@cle92.test', 'staff', 'en-AU',
    '92000000-0000-4000-8000-000000000001',
    false, now() + interval '7 days', null, null, now()
  ),
  (
    '92000000-0000-4000-8000-000000000203',
    '92000000-0000-4000-8000-000000000010',
    'expired@cle92.test', 'staff', 'en-AU',
    '92000000-0000-4000-8000-000000000001',
    false, now() - interval '1 day', null, null, null
  ),
  (
    '92000000-0000-4000-8000-000000000204',
    '92000000-0000-4000-8000-000000000010',
    'accepted@cle92.test', 'staff', 'en-AU',
    '92000000-0000-4000-8000-000000000001',
    false, now() + interval '7 days', now(),
    '92000000-0000-4000-8000-000000000001', null
  );

set local role service_role;

-- ---------------------------------------------------------------------------
-- A live invitation hands back what the e-mail needs
-- ---------------------------------------------------------------------------

-- One call, every column: claiming is rate limited, so a second call to inspect another
-- column would be refused and assert nothing.
select results_eq(
  $$select claimed, invitee_email, locale::text, account_confirmed
      from public.claim_employee_invitation_link(
        '92000000-0000-4000-8000-000000000201'
      )$$,
  $$values (true, 'live@cle92.test'::text, 'pt-BR'::text, false)$$,
  'a live invitation yields the address, the language, and which e-mail to send'
);

select isnt(
  (
    select last_link_sent_at from public.employee_invitations
    where id = '92000000-0000-4000-8000-000000000201'
  ),
  null,
  'claiming records the send, so the next attempt can be refused'
);

-- ---------------------------------------------------------------------------
-- The sixty-second floor, which is the project's own smtp_max_frequency
-- ---------------------------------------------------------------------------

select results_eq(
  $$select claimed, invitee_email
      from public.claim_employee_invitation_link(
        '92000000-0000-4000-8000-000000000201'
      )$$,
  $$values (false, null::text)$$,
  'a second claim within the minute is refused, and gives away no address'
);

select lives_ok(
  $$update public.employee_invitations
    set last_link_sent_at = now() - interval '61 seconds'
    where id = '92000000-0000-4000-8000-000000000201'$$,
  'the fixture ages the last send past the floor'
);

select is(
  (
    select claimed from public.claim_employee_invitation_link(
      '92000000-0000-4000-8000-000000000201'
    )
  ),
  true,
  'once the minute has passed the invitee can ask again'
);

-- ---------------------------------------------------------------------------
-- Nothing that cannot be accepted may spend the e-mail allowance
-- ---------------------------------------------------------------------------

select is(
  (
    select claimed from public.claim_employee_invitation_link(
      '92000000-0000-4000-8000-000000000202'
    )
  ),
  false,
  'a revoked invitation cannot be re-sent'
);

select is(
  (
    select claimed from public.claim_employee_invitation_link(
      '92000000-0000-4000-8000-000000000203'
    )
  ),
  false,
  'an expired invitation cannot be re-sent'
);

select is(
  (
    select claimed from public.claim_employee_invitation_link(
      '92000000-0000-4000-8000-000000000204'
    )
  ),
  false,
  'an accepted invitation cannot be re-sent'
);

select is(
  (
    select claimed from public.claim_employee_invitation_link(
      '92000000-0000-4000-8000-0000000009ff'
    )
  ),
  false,
  'an id that matches nothing is refused rather than raising'
);

select is(
  (
    select count(*)::integer from public.claim_employee_invitation_link(
      '92000000-0000-4000-8000-0000000009ff'
    )
  ),
  1,
  'a refusal is still one row, so the caller never has to handle an empty result'
);

reset role;

select * from finish();

rollback;
