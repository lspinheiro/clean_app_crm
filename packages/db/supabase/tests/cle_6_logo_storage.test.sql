begin;
create extension if not exists pgtap with schema extensions;
select set_config('storage.allow_delete_query', 'true', true);
select plan(56);

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
    'public.update_company_identity(uuid,text,text,text)',
    'EXECUTE'
  ),
  'authenticated users can execute the narrow identity RPC'
);

select ok(
  to_regclass('public.company_logo_upload_reservations') is not null,
  'company logo upload reservations exist'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.company_logo_upload_reservations'::regclass),
  'company logo upload reservations have RLS enabled'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.company_logo_upload_reservations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'authenticated users cannot bypass reservation RPCs with direct table access'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.company_logo_upload_reservations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service role has explicit reservation DML grants'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.reserve_company_logo_upload(uuid,text)',
    'EXECUTE'
  ),
  'authenticated users can execute the narrow upload-reservation RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.reserve_company_logo_upload(uuid,text)',
    'EXECUTE'
  ),
  'anonymous users cannot reserve logo uploads'
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
  public.can_manage_company_logo('10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'),
  'company admin can manage the canonical logo path for their company'
);
select ok(
  not public.can_manage_company_logo('10000000-0000-4000-8000-000000000010/original.png'),
  'non-canonical logo filenames are rejected'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'company-logos',
      '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp',
      auth.uid()::text
    )$$,
  '42501',
  null,
  'a valid logo object cannot be inserted without an upload reservation'
);
select is(
  public.reserve_company_logo_upload(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
  ),
  '10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
  'company admin reserves one exact logo object path'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'company-logos',
      '10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
      auth.uid()::text,
      '{"mimetype":"image/webp","cacheControl":"3600"}'::jsonb
    )$$,
  'company admin can insert their canonical logo object'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'company-logos'
      and name = '10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
  ),
  1,
  'company admin can read their canonical logo object'
);
select results_eq(
  $$with changed as (
      update storage.objects
      set metadata = '{"tampered":true}'::jsonb
      where bucket_id = 'company-logos'
        and name = '10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
      returning 1
    )
    select count(*)::integer from changed$$,
  $$values (0)$$,
  'uploaded logo objects cannot be overwritten or renamed'
);
select is(
  (
    select metadata ->> 'cacheControl'
    from storage.objects
    where bucket_id = 'company-logos'
      and name = '10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
  ),
  '3600',
  'the uploaded logo retains its immutable metadata'
);
select is(
  public.reserve_company_logo_upload(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'
  ),
  '10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
  'an existing pending object must be cleaned before another path can be reserved'
);
select ok(
  not public.can_upload_reserved_company_logo(
    '10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
  ),
  'reserving a replacement invalidates the stale candidate reservation'
);
select ok(
  not public.can_delete_unreferenced_company_logo(
    '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'
  ),
  'the newly reserved candidate is protected from direct deletion'
);
select ok(
  public.can_delete_unreferenced_company_logo(
    '10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
  ),
  'the invalidated stale candidate is eligible for cleanup'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'company-logos',
      '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp',
      auth.uid()::text
    )$$,
  '42501',
  null,
  'the pending-object cap rejects a second versioned upload'
);
select lives_ok(
  $$delete from storage.objects
    where bucket_id = 'company-logos'
      and name = '10000000-0000-4000-8000-000000000010/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'$$,
  'the replacement reservation permits cleanup of the stale candidate'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'company-logos',
      '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp',
      auth.uid()::text,
      '{"mimetype":"image/webp","cacheControl":"3600"}'::jsonb
    )$$,
  'the replacement candidate uploads after stale cleanup'
);
select results_eq(
  $$with deleted as (
      delete from storage.objects
      where bucket_id = 'company-logos'
        and name = '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'
      returning 1
    )
    select count(*)::integer from deleted$$,
  $$values (0)$$,
  'the uploaded and still-reserved candidate cannot be deleted directly'
);
select lives_ok(
  $$select public.update_company_identity(
    '10000000-0000-4000-8000-000000000010',
    '  Coastal Identity Test  ',
    '51 824 753 556',
    '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'
  )$$,
  'company admin atomically updates identity fields and the uploaded logo path'
);
select ok(
  not public.can_upload_reserved_company_logo(
    '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'
  ),
  'the identity commit consumes the upload reservation'
);
select throws_ok(
  $$select public.update_company_identity(
    '10000000-0000-4000-8000-000000000010',
    'Invalid path mutation',
    '51824753556',
    '10000000-0000-4000-8000-000000000010/logo.webp'
  )$$,
  '23514',
  'Company logo path is invalid',
  'identity RPC rejects non-versioned logo paths'
);
select throws_ok(
  $$select public.update_company_identity(
    '10000000-0000-4000-8000-000000000010',
    'Missing object mutation',
    '51824753556',
    '10000000-0000-4000-8000-000000000010/logo-cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp'
  )$$,
  '23503',
  'Company logo object not found',
  'identity RPC cannot point at a logo object that was not uploaded'
);
select results_eq(
  $$select name, logo_path
    from public.companies
    where id = '10000000-0000-4000-8000-000000000010'$$,
  $$values (
    'Coastal Identity Test'::text,
    '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'::text
  )$$,
  'rejected logo pointer mutations leave identity and active logo paired'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'company-logos',
      '10000000-0000-4000-8000-000000000010/original.png',
      auth.uid()::text
    )$$,
  '42501',
  null,
  'company admin cannot insert a non-canonical logo object'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'company-logos',
      '20000000-0000-4000-8000-000000000010/logo-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
      auth.uid()::text
    )$$,
  '42501',
  null,
  'company admin cannot insert a foreign company logo object'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.company_logo_upload_reservations
    where company_id = '10000000-0000-4000-8000-000000000010'
  ),
  0,
  'the identity commit removes the consumed reservation row'
);

select results_eq(
  $$select name, abn, logo_path from public.companies where id = '10000000-0000-4000-8000-000000000010'$$,
  $$values (
    'Coastal Identity Test'::text,
    '51824753556'::text,
    '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'::text
  )$$,
  'identity RPC trims the name, canonicalises ABN, and owns the logo path'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  not public.can_manage_company_logo('10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'),
  'another company admin cannot manage a foreign logo path'
);
select is(
  public.reserve_company_logo_upload(
    '20000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000010/logo-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp'
  ),
  '20000000-0000-4000-8000-000000000010/logo-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
  'another company admin can reserve only their own logo path'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'company-logos',
      '20000000-0000-4000-8000-000000000010/logo-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
      auth.uid()::text,
      '{"mimetype":"image/webp"}'::jsonb
    )$$,
  'another company admin can insert their own canonical logo object'
);
select results_eq(
  $$select name from storage.objects where bucket_id = 'company-logos' order by name$$,
  array['20000000-0000-4000-8000-000000000010/logo-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp']::text[],
  'another company admin sees only their own logo object'
);
select results_eq(
  $$with changed as (
      update storage.objects
      set metadata = '{"tampered":true}'::jsonb
      where bucket_id = 'company-logos'
        and name = '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'
      returning 1
    )
    select count(*)::integer from changed$$,
  $$values (0)$$,
  'another company admin cannot update a foreign logo object'
);
select results_eq(
  $$with deleted as (
      delete from storage.objects
      where bucket_id = 'company-logos'
        and name = '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'
      returning 1
    )
    select count(*)::integer from deleted$$,
  $$values (0)$$,
  'another company admin cannot delete a foreign logo object'
);
select throws_ok(
  $$select public.update_company_identity(
    '10000000-0000-4000-8000-000000000010',
    'Foreign mutation',
    '11111111111',
    null
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
  not public.can_manage_company_logo('10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'),
  'cleaners cannot manage company logos'
);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'company-logos'),
  0,
  'cleaners cannot read company logo objects'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'company-logos',
      '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp',
      auth.uid()::text
    )$$,
  '42501',
  null,
  'cleaners cannot insert company logo objects'
);
select throws_ok(
  $$select public.update_company_identity(
    '10000000-0000-4000-8000-000000000010',
    'Cleaner mutation',
    '11111111111',
    null
  )$$,
  '42501',
  'Company admin access required',
  'cleaners cannot update company identity data'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select metadata ->> 'cacheControl'
    from storage.objects
    where bucket_id = 'company-logos'
      and name = '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'$$,
  array['3600']::text[],
  'foreign mutation attempts leave the company logo unchanged'
);
select results_eq(
  $$with changed as (
      update storage.objects
      set metadata = '{"tampered":true}'::jsonb
      where bucket_id = 'company-logos'
        and name = '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'
      returning 1
    )
    select count(*)::integer from changed$$,
  $$values (0)$$,
  'company admin cannot overwrite the active logo object'
);
select results_eq(
  $$with deleted as (
      delete from storage.objects
      where bucket_id = 'company-logos'
        and name = '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'
      returning 1
    )
    select count(*)::integer from deleted$$,
  $$values (0)$$,
  'company admin cannot delete the active logo object'
);
select results_eq(
  $$select metadata ->> 'cacheControl'
    from storage.objects
    where bucket_id = 'company-logos'
      and name = '10000000-0000-4000-8000-000000000010/logo-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'$$,
  array['3600']::text[],
  'active logo mutation attempts leave the referenced object unchanged'
);
select is(
  public.reserve_company_logo_upload(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000010/logo-dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp'
  ),
  '10000000-0000-4000-8000-000000000010/logo-dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp',
  'company admin can reserve one candidate beside the active logo'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'company-logos',
      '10000000-0000-4000-8000-000000000010/logo-dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp',
      auth.uid()::text,
      '{"mimetype":"image/webp"}'::jsonb
    )$$,
  'company admin can insert another versioned logo candidate'
);
select is(
  public.reserve_company_logo_upload(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000010/logo-ffffffff-ffff-4fff-8fff-ffffffffffff.webp'
  ),
  '10000000-0000-4000-8000-000000000010/logo-dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp',
  'a later reservation invalidates the pending candidate before cleanup'
);
select lives_ok(
  $$delete from storage.objects
    where bucket_id = 'company-logos'
      and name = '10000000-0000-4000-8000-000000000010/logo-dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp'$$,
  'company admin can delete an unreferenced old logo object'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'company-logos'
      and name = '10000000-0000-4000-8000-000000000010/logo-dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp'
  ),
  0,
  'the authorised cleanup removes the unreferenced logo object'
);
reset role;

select * from finish();
rollback;
