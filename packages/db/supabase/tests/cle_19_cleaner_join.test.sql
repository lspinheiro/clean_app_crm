begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select function_privs_are(
  'public', 'cleaner_invite_preview', array['text'], 'anon', array['EXECUTE'],
  'anonymous visitors retain only the legacy dead-link preview capability'
);
select function_privs_are(
  'public', 'join_company_pool', array['text', 'text', 'text', 'text'],
  'authenticated', array['EXECUTE'],
  'the old join API remains callable only to report retirement'
);
select function_privs_are(
  'public', 'apply_to_posting', array['text', 'text', 'text', 'text', 'text'],
  'authenticated', array['EXECUTE'],
  'posting application replaces direct cleaner membership creation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.apply_to_posting(text, text, text, text, text)',
    'EXECUTE'
  ),
  'anonymous callers cannot apply at the grant boundary'
);
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE19POSTING0001', 'Ana Silva', '0400 000 111', 'Southport', null
  )$$,
  '42501',
  'permission denied for function apply_to_posting',
  'an anonymous caller is refused before the posting RPC runs'
);
reset role;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '19000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'cle-19-retired-join@example.test',
  crypt('local-test-only', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"New cleaner"}', now(), now(), '', '', '', ''
);

delete from public.company_invites
where company_id = '10000000-0000-4000-8000-000000000010';
insert into public.company_invites (company_id, code, expires_at)
values (
  '10000000-0000-4000-8000-000000000010',
  'CLEAN1DEMOJOIN99',
  now() + interval '1 day'
);
insert into public.postings (
  id, company_id, code, intent, public_description
) values (
  '19000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000010',
  'CLE19POSTING0001',
  'expression_of_interest',
  'Join the cleaner staff through a request.'
);

select results_eq(
  $$select state, company_name, pool_size
      from public.cleaner_invite_preview('CLEAN1DEMOJOIN99')$$,
  $$values ('revoked'::text, null::text, 0)$$,
  'a live-shaped old link always reports the dead no-longer-active state'
);
select results_eq(
  $$select state, company_name, pool_size
      from public.cleaner_invite_preview('NOSUCHCODE000000')$$,
  $$values ('unknown'::text, null::text, 0)$$,
  'an unknown old link remains non-disclosing'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.join_company_pool(
    'CLEAN1DEMOJOIN99', 'Ana Silva', '0400 000 111', 'Southport'
  )$$,
  '23514',
  'Invite code is no longer active',
  'a formerly live old link cannot create a cleaner membership'
);
reset role;

select results_eq(
  $$select profile.full_name, profile.phone, profile.suburb,
           (select count(*)::integer from public.company_members membership
             where membership.company_id = '10000000-0000-4000-8000-000000000010'
               and membership.profile_id = profile.id)
      from public.profiles profile
     where profile.id = '19000000-0000-4000-8000-000000000001'$$,
  $$values ('New cleaner'::text, null::text, null::text, 0)$$,
  'retired join attempts leave profile and membership state unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE19POSTING0001', '   ', '0400 000 111', 'Southport', null
  )$$,
  '22023',
  'Full name, phone, and suburb are required',
  'posting registration refuses a blank name'
);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE19POSTING0001', 'Ana Silva', '0400 000 111', '   ', null
  )$$,
  '22023',
  'Full name, phone, and suburb are required',
  'posting registration refuses a blank suburb'
);
select lives_ok(
  $$select public.apply_to_posting(
    'CLE19POSTING0001', 'Ana Silva', '0400 000 111', 'Southport', 'Available weekdays'
  )$$,
  'the replacement posting flow creates an application request'
);
select is(
  (select count(*)::integer from public.job_applications),
  0,
  'a waiting candidate cannot read raw application rows'
);
select results_eq(
  $$select join_request_state::text, application_state::text
      from public.cleaner_join_request_state$$,
  $$values ('waiting'::text, 'applied'::text)$$,
  'the waiting candidate reads only the dedicated relationship-state projection'
);
select is(
  (select count(*)::integer from public.cleaner_job_board),
  0,
  'the replacement flow still grants no board access before admission'
);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE19POSTING0001', 'Ana Silva', '0400 000 111', 'Southport', null
  )$$,
  '23505',
  'Person can apply only once per posting',
  'the same person cannot duplicate an application to one posting'
);
reset role;

select results_eq(
  $$select request.state::text, request.note, profile.full_name, profile.phone,
           profile.suburb,
           (select count(*)::integer from public.company_members membership
             where membership.company_id = request.company_id
               and membership.profile_id = request.profile_id)
      from public.join_requests request
      join public.profiles profile on profile.id = request.profile_id
     where request.profile_id = '19000000-0000-4000-8000-000000000001'$$,
  $$values (
    'waiting'::text, 'Available weekdays'::text, 'Ana Silva'::text,
    '0400 000 111'::text, 'Southport'::text, 0
  )$$,
  'posting application persists the profile and note but creates no membership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.apply_to_posting(
    'CLE19POSTING0001', 'Demo Removed Cleaner', '0400 000 333', 'Southport', null
  )$$,
  '42501',
  'This company removed you from its cleaner staff',
  'a removed cleaner cannot re-enter through a posting'
);
reset role;
select is(
  (
    select status::text
    from public.company_members
    where company_id = '10000000-0000-4000-8000-000000000010'
      and profile_id = '10000000-0000-4000-8000-000000000005'
  ),
  'removed',
  'a refused posting application leaves the removal in place'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.apply_to_posting(
    'CLE19POSTING0001', 'Demo Company Admin', '0400 000 222', 'Southport', null
  )$$,
  'an employee can request cleaner-staff entry through the posting'
);
select lives_ok(
  $$select public.admit_join_request(
    (select id from public.join_requests
      where company_id = '10000000-0000-4000-8000-000000000010'
        and profile_id = '10000000-0000-4000-8000-000000000001')
  )$$,
  'the employee request can be admitted as a cleaner membership'
);
reset role;
select results_eq(
  $$select
      exists (
        select 1 from public.employee_memberships
        where company_id = '10000000-0000-4000-8000-000000000010'
          and profile_id = '10000000-0000-4000-8000-000000000001'
          and status = 'active'
      ),
      exists (
        select 1 from public.company_members
        where company_id = '10000000-0000-4000-8000-000000000010'
          and profile_id = '10000000-0000-4000-8000-000000000001'
          and status = 'active'
      )$$,
  $$values (true, true)$$,
  'same-company employee and cleaner memberships coexist for one account'
);

select * from finish();
rollback;
