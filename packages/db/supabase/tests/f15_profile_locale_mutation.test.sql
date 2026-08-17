begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select lives_ok(
  $fixtures$
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    )
    values
      (
        '15000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'locale-admin@example.test',
        crypt('local-test-only', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Locale Admin","preferred_locale":"pt-BR"}',
        now(), now(), '', '', '', ''
      ),
      (
        '15000000-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'locale-cleaner@example.test',
        crypt('local-test-only', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Locale Cleaner"}',
        now(), now(), '', '', '', ''
      ),
      (
        '15000000-0000-4000-8000-000000000003',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'invalid-locale@example.test',
        crypt('local-test-only', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Invalid Locale","preferred_locale":"fr-FR"}',
        now(), now(), '', '', '', ''
      )
  $fixtures$,
  'account creation accepts valid, absent, and unknown locale metadata'
);

update public.profiles
set role = 'company_admin'
where id = '15000000-0000-4000-8000-000000000001';

select is(
  (select preferred_locale from public.profiles where id = '15000000-0000-4000-8000-000000000001'),
  'pt-BR'::public.app_locale,
  'valid sign-up metadata bootstraps a Portuguese preference'
);

select is(
  (select preferred_locale from public.profiles where id = '15000000-0000-4000-8000-000000000002'),
  null::public.app_locale,
  'omitted sign-up metadata leaves the preference unresolved'
);

select is(
  (select preferred_locale from public.profiles where id = '15000000-0000-4000-8000-000000000003'),
  null::public.app_locale,
  'unknown sign-up metadata does not store an unsupported value'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$update public.profiles set preferred_locale = 'en-AU'
    where id = '15000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'a cleaner cannot bypass the RPC to change a profile'
);

select is(
  public.set_preferred_locale('pt-BR'),
  'pt-BR'::public.app_locale,
  'a cleaner can select Brazilian Portuguese'
);
reset role;

select is(
  (select preferred_locale from public.profiles where id = '15000000-0000-4000-8000-000000000002'),
  'pt-BR'::public.app_locale,
  'the cleaner preference persists'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.set_preferred_locale('pt-BR'),
  'pt-BR'::public.app_locale,
  'repeating the same preference is safe'
);
reset role;

select is(
  (select count(*)::integer from public.profiles where id = '15000000-0000-4000-8000-000000000002'),
  1,
  'repeating a preference never creates another profile'
);

select is(
  (select preferred_locale from public.profiles where id = '15000000-0000-4000-8000-000000000001'),
  'pt-BR'::public.app_locale,
  'one user changing language does not affect another user'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.set_preferred_locale('en-AU'),
  'en-AU'::public.app_locale,
  'a company admin can select Australian English'
);
reset role;

select is(
  (select preferred_locale from public.profiles where id = '15000000-0000-4000-8000-000000000001'),
  'en-AU'::public.app_locale,
  'the company-admin preference persists'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.set_preferred_locale('fr-FR')$$,
  '22P02',
  null,
  'an unsupported locale cannot enter the RPC'
);

select throws_ok(
  $$select public.set_preferred_locale(null::public.app_locale)$$,
  '22023',
  'Supported language required',
  'a null preference is rejected'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select public.set_preferred_locale('en-AU')$$,
  '42501',
  null,
  'an anonymous caller cannot persist a preference'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000099', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.set_preferred_locale('en-AU')$$,
  'P0002',
  'Profile not found',
  'an identity without a profile cannot create one through the RPC'
);
reset role;

select * from finish();

rollback;
