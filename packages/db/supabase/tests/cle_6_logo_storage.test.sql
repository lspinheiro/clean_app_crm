begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select is(
  (select count(*)::integer from storage.buckets where id = 'company-logos' and not public),
  1,
  'company logos use a private storage bucket'
);

select is(
  (
    select count(*)::integer
    from storage.buckets
    where id = 'company-logos'
      and file_size_limit = 400000
      and allowed_mime_types = array['image/webp']::text[]
  ),
  1,
  'the logo bucket only accepts compressed WebP files under 400 KB'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'company_logos_%'
  ),
  4,
  'company logos have explicit select, insert, update, and delete policies'
);

select ok(
  not has_table_privilege('authenticated', 'public.companies', 'UPDATE'),
  'authenticated users cannot update arbitrary company columns directly'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_company_identity(uuid,text,text,boolean)',
    'EXECUTE'
  ),
  'authenticated users can execute the narrow identity RPC'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'tenant-b-logo-admin@example.test',
  crypt('local-test-only', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Tenant B Logo Admin"}', now(), now(), '', '', '', ''
);
update public.profiles
set role = 'company_admin'
where id = '20000000-0000-4000-8000-000000000001';
insert into public.companies (id, name, abn, status)
values ('20000000-0000-4000-8000-000000000010', 'Tenant B Logo Demo', '22222222222', 'approved');
insert into public.company_members (company_id, profile_id)
values ('20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  public.can_manage_company_logo('10000000-0000-4000-8000-000000000010/logo.webp'),
  'company admin can manage the canonical logo path for their company'
);
select ok(
  not public.can_manage_company_logo('10000000-0000-4000-8000-000000000010/original.png'),
  'non-canonical logo filenames are rejected'
);
select lives_ok(
  $$select public.update_company_identity(
    '10000000-0000-4000-8000-000000000010',
    '  Coastal Identity Test  ',
    '51 824 753 556',
    true
  )$$,
  'company admin can update only the approved identity fields'
);
reset role;

select results_eq(
  $$select name, abn, logo_path from public.companies where id = '10000000-0000-4000-8000-000000000010'$$,
  $$values (
    'Coastal Identity Test'::text,
    '51824753556'::text,
    '10000000-0000-4000-8000-000000000010/logo.webp'::text
  )$$,
  'identity RPC trims the name, canonicalises ABN, and owns the logo path'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  not public.can_manage_company_logo('10000000-0000-4000-8000-000000000010/logo.webp'),
  'another company admin cannot manage a foreign logo path'
);
select throws_ok(
  $$select public.update_company_identity(
    '10000000-0000-4000-8000-000000000010',
    'Foreign mutation',
    '11111111111',
    false
  )$$,
  '42501',
  'Company admin access required',
  'another company admin cannot update foreign identity data'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  not public.can_manage_company_logo('10000000-0000-4000-8000-000000000010/logo.webp'),
  'cleaners cannot manage company logos'
);
select throws_ok(
  $$select public.update_company_identity(
    '10000000-0000-4000-8000-000000000010',
    'Cleaner mutation',
    '11111111111',
    false
  )$$,
  '42501',
  'Company admin access required',
  'cleaners cannot update company identity data'
);
reset role;

select * from finish();
rollback;
