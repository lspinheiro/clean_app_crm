begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  (
    '80000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', ' First.Admin@Example.Test ',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Untrusted Name","role":"admin","company_id":"10000000-0000-4000-8000-000000000010"}',
    now(), now(), '', '', '', ''
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'other.admin@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Other User"}',
    now(), now(), '', '', '', ''
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'expired.admin@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Expired User"}',
    now(), now(), '', '', '', ''
  ),
  (
    '80000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'revoked.admin@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Revoked User"}',
    now(), now(), '', '', '', ''
  ),
  (
    '80000000-0000-4000-8000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'retry.admin@example.test',
    crypt('local-test-only', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Retry User"}',
    now(), now(), '', '', '', ''
  );

select is(
  (select count(*)::integer from public.employee_memberships where profile_id = '80000000-0000-4000-8000-000000000001'),
  0,
  'untrusted Auth metadata cannot create an employee membership'
);

create temporary table first_prepare on commit drop as
select *
from public.prepare_first_admin_invitation(
  '  FIRST.ADMIN@EXAMPLE.TEST ',
  'pt-BR',
  'founder@example.test',
  now() + interval '1 hour'
);

select ok((select created from first_prepare), 'the first preparation creates state');
select is(
  (select email from public.first_admin_invitations where id = (select invitation_id from first_prepare)),
  'first.admin@example.test',
  'preparation trims and lowercases the e-mail'
);
select is(
  (select invited_by from public.first_admin_invitations where id = (select invitation_id from first_prepare)),
  'founder@example.test',
  'preparation records the trusted operator identity'
);

create temporary table repeated_prepare on commit drop as
select *
from public.prepare_first_admin_invitation(
  'first.admin@example.test',
  'en-AU',
  'another-founder@example.test',
  now() + interval '2 hours'
);

select ok(not (select created from repeated_prepare), 'a repeated pending preparation creates no send');
select is(
  (select invitation_id from repeated_prepare),
  (select invitation_id from first_prepare),
  'a repeated preparation returns the same invitation'
);
select is(
  (select count(*)::integer from public.first_admin_invitations where email = 'first.admin@example.test'),
  1,
  'a repeated preparation creates no duplicate row'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select invitation_status, invitee_email, locale::text
    from public.get_first_admin_invitation_context()$$,
  $$values ('pending'::text, 'first.admin@example.test'::text, 'pt-BR'::text)$$,
  'the acceptance context derives the caller e-mail and pending locale'
);

create temporary table accepted_company on commit drop as
select public.accept_first_admin_invitation(
  '  First Admin ',
  '  New Coast Cleaning ',
  '53 004 085 616',
  '  0412 345 678 ',
  'en-AU'
) as company_id;

reset role;

select is(
  (select role from public.employee_memberships where profile_id = '80000000-0000-4000-8000-000000000001'),
  'owner'::public.employee_role,
  'acceptance creates an owner employee membership'
);
select is(
  (select full_name from public.profiles where id = '80000000-0000-4000-8000-000000000001'),
  'First Admin',
  'acceptance stores the submitted full name'
);
select is(
  (select phone from public.profiles where id = '80000000-0000-4000-8000-000000000001'),
  '0412 345 678',
  'acceptance stores the submitted contact phone'
);
select is(
  (select preferred_locale from public.profiles where id = '80000000-0000-4000-8000-000000000001'),
  'en-AU'::public.app_locale,
  'acceptance stores the selected locale instead of Auth metadata'
);
select results_eq(
  $$select name, abn, status::text
    from public.companies
    where id = (select company_id from accepted_company)$$,
  $$values ('New Coast Cleaning'::text, '53004085616'::text, 'approved'::text)$$,
  'acceptance creates one approved company with canonical identity'
);
select results_eq(
  $$select profile_id, role::text, status::text
    from public.employee_memberships
    where company_id = (select company_id from accepted_company)$$,
  $$values ('80000000-0000-4000-8000-000000000001'::uuid, 'owner'::text, 'active'::text)$$,
  'acceptance creates one active owner membership for the caller'
);
select results_eq(
  $$select accepted_by_profile_id, company_id, accepted_at is not null
    from public.first_admin_invitations
    where id = (select invitation_id from first_prepare)$$,
  $$values (
    '80000000-0000-4000-8000-000000000001'::uuid,
    (select company_id from accepted_company),
    true
  )$$,
  'acceptance consumes the invitation with profile and company attribution'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.accept_first_admin_invitation(
    'Replay Admin', 'Replay Company', '53004085616', '0400000000', 'en-AU'
  )$$,
  '28000',
  'Invitation is no longer available',
  'a consumed invitation cannot be replayed'
);
reset role;

select is(
  (select count(*)::integer from public.companies where id = (select company_id from accepted_company)),
  1,
  'a replay creates no duplicate company'
);
select is(
  (select count(*)::integer from public.employee_memberships where profile_id = '80000000-0000-4000-8000-000000000001'),
  1,
  'a replay creates no duplicate membership'
);

select *
from public.prepare_first_admin_invitation(
  'mismatch.admin@example.test', 'en-AU', 'founder@example.test', now() + interval '1 hour'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.accept_first_admin_invitation(
    'Other Admin', 'Wrong Company', '53004085616', '0400000001', 'en-AU'
  )$$,
  '28000',
  'Invitation is no longer available',
  'an e-mail mismatch cannot accept another invitation'
);
reset role;

select is(
  (select count(*)::integer from public.employee_memberships where profile_id = '80000000-0000-4000-8000-000000000002'),
  0,
  'a mismatched user receives no employee membership'
);
select is(
  (select count(*)::integer from public.employee_memberships where profile_id = '80000000-0000-4000-8000-000000000002'),
  0,
  'a mismatched user receives no membership'
);

select *
from public.prepare_first_admin_invitation(
  'expired.admin@example.test', 'en-AU', 'founder@example.test', now() + interval '1 hour'
);
update public.first_admin_invitations
set expires_at = now() - interval '1 minute'
where email = 'expired.admin@example.test' and accepted_at is null and revoked_at is null;

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.accept_first_admin_invitation(
    'Expired Admin', 'Expired Company', '53004085616', '0400000002', 'en-AU'
  )$$,
  '28000',
  'Invitation is no longer available',
  'an expired invitation cannot be accepted'
);
reset role;

select is(
  (select count(*)::integer from public.employee_memberships where profile_id = '80000000-0000-4000-8000-000000000003'),
  0,
  'an expired invitation creates no employee membership'
);

create temporary table renewed_expired_prepare on commit drop as
select to_jsonb(prepared) as result
from public.prepare_first_admin_invitation(
  'expired.admin@example.test', 'pt-BR', 'founder@example.test', now() + interval '1 hour'
) prepared;

select is(
  (select result ->> 'created' from renewed_expired_prepare),
  'true',
  'a trusted rerun renews expired application invitation state'
);
select is(
  (select result ->> 'confirmed_auth_user' from renewed_expired_prepare),
  'true',
  'preparation tells the command when recovery e-mail is required'
);

create temporary table revoked_prepare on commit drop as
select *
from public.prepare_first_admin_invitation(
  'revoked.admin@example.test', 'pt-BR', 'founder@example.test', now() + interval '1 hour'
);
select public.revoke_first_admin_invitation((select invitation_id from revoked_prepare));

select ok(
  (select revoked_at is not null from public.first_admin_invitations where id = (select invitation_id from revoked_prepare)),
  'the trusted command can revoke prepared state after a send failure'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.accept_first_admin_invitation(
    'Revoked Admin', 'Revoked Company', '53004085616', '0400000003', 'pt-BR'
  )$$,
  '28000',
  'Invitation is no longer available',
  'a revoked invitation cannot be accepted'
);
reset role;

select is(
  (select count(*)::integer from public.employee_memberships where profile_id = '80000000-0000-4000-8000-000000000004'),
  0,
  'a revoked invitation creates no membership'
);

create temporary table retry_prepare on commit drop as
select *
from public.prepare_first_admin_invitation(
  'retry.admin@example.test', 'en-AU', 'founder@example.test', now() + interval '1 hour'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.accept_first_admin_invitation(
    '', 'Retry Company', 'bad-abn', '', 'en-AU'
  )$$,
  '23514',
  'Full name is required',
  'invalid form data aborts acceptance'
);

select throws_ok(
  $$select public.accept_first_admin_invitation(
    null::text, 'Retry Company', '53004085616', '0400000004', 'en-AU'
  )$$,
  '23514',
  'Full name is required',
  'a null full name is rejected explicitly'
);
select throws_ok(
  $$select public.accept_first_admin_invitation(
    'Retry Admin', null::text, '53004085616', '0400000004', 'en-AU'
  )$$,
  '23514',
  'Company name is required',
  'a null company name is rejected explicitly'
);
select throws_ok(
  $$select public.accept_first_admin_invitation(
    'Retry Admin', 'Retry Company', null::text, '0400000004', 'en-AU'
  )$$,
  '23514',
  'ABN must contain exactly 11 digits',
  'a null ABN is rejected explicitly'
);
select throws_ok(
  $$select public.accept_first_admin_invitation(
    'Retry Admin', 'Retry Company', '53004085616', null::text, 'en-AU'
  )$$,
  '23514',
  'Contact phone is required',
  'a null contact phone is rejected explicitly'
);
select throws_ok(
  $$select public.accept_first_admin_invitation(
    'Retry Admin', 'Retry Company', '53004085616', '0400000004', null::public.app_locale
  )$$,
  '22023',
  'Supported language required',
  'a null locale is rejected explicitly'
);
reset role;

select is(
  (select count(*)::integer from public.employee_memberships where profile_id = '80000000-0000-4000-8000-000000000005'),
  0,
  'a failed acceptance creates no employee membership'
);
select is(
  (select count(*)::integer from public.employee_memberships where profile_id = '80000000-0000-4000-8000-000000000005'),
  0,
  'a failed acceptance creates no membership'
);
select ok(
  (
    select accepted_at is null and revoked_at is null
    from public.first_admin_invitations
    where id = (select invitation_id from retry_prepare)
  ),
  'a failed acceptance leaves the invitation retryable'
);

select throws_ok(
  $$select * from public.prepare_first_admin_invitation(
    'invalid', 'en-AU', 'founder@example.test', now() + interval '1 hour'
  )$$,
  '22023',
  'A valid invitee e-mail is required',
  'the trusted preparation validates the invitee e-mail'
);

select throws_ok(
  $$select * from public.prepare_first_admin_invitation(
    null::text, 'en-AU', 'founder@example.test', now() + interval '1 hour'
  )$$,
  '22023',
  'A valid invitee e-mail is required',
  'the trusted preparation rejects a null invitee e-mail explicitly'
);

select throws_ok(
  $$select * from public.prepare_first_admin_invitation(
    'new.admin@example.test', 'en-AU', '', now() + interval '1 hour'
  )$$,
  '22023',
  'The inviting operator is required',
  'the trusted preparation requires an audit actor'
);

select throws_ok(
  $$select * from public.prepare_first_admin_invitation(
    'new.admin@example.test', 'en-AU', null::text, now() + interval '1 hour'
  )$$,
  '22023',
  'The inviting operator is required',
  'the trusted preparation rejects a null audit actor explicitly'
);

select throws_ok(
  $$select * from public.prepare_first_admin_invitation(
    'new.admin@example.test', 'en-AU', 'founder@example.test', now() - interval '1 minute'
  )$$,
  '22023',
  'Invitation expiry must be in the future',
  'the trusted preparation requires a future expiry'
);

select * from finish();

rollback;
