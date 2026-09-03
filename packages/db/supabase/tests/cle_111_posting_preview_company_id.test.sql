begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- Two companies deliberately share a display name. `companies.name` carries no uniqueness
-- constraint, so a preview that returns only the name cannot tell a visitor which company
-- the posting belongs to.
insert into public.companies (id, name, abn, status)
values
  (
    '11100000-0000-4000-8000-000000000010',
    'Shared Name Cleaning',
    '11100000001',
    'approved'
  ),
  (
    '11100000-0000-4000-8000-000000000020',
    'Shared Name Cleaning',
    '11100000002',
    'approved'
  );

insert into public.postings (
  id, company_id, code, intent, public_description, job_id,
  recurring_assignment_id, expires_at, application_cap, revoked_at
) values
  (
    '11100000-0000-4000-8000-000000000501',
    '11100000-0000-4000-8000-000000000010',
    'CLE111FIRST00001', 'expression_of_interest',
    'The first company is hiring.', null, null, null, null, null
  ),
  (
    '11100000-0000-4000-8000-000000000502',
    '11100000-0000-4000-8000-000000000020',
    'CLE111SECOND0001', 'expression_of_interest',
    'The second company is hiring.', null, null, null, null, null
  );

select results_eq(
  $$select company_id from public.posting_preview('CLE111FIRST00001')$$,
  $$values ('11100000-0000-4000-8000-000000000010'::uuid)$$,
  'an active preview identifies its company by id'
);

select results_eq(
  $$select company_id from public.posting_preview('CLE111SECOND0001')$$,
  $$values ('11100000-0000-4000-8000-000000000020'::uuid)$$,
  'two companies sharing a display name are told apart by the preview'
);

-- The dead paths return a null for every field they cannot fill. Asserting the pairing of
-- state and company_id catches a column ordering mistake that a count alone would miss.
select results_eq(
  $$select state, company_id from public.posting_preview('CLE111NOSUCH0001')$$,
  $$values ('dead'::text, null::uuid)$$,
  'an unknown posting code carries no company identity'
);

update public.postings
set revoked_at = now()
where id = '11100000-0000-4000-8000-000000000501';

select results_eq(
  $$select state, company_id from public.posting_preview('CLE111FIRST00001')$$,
  $$values ('dead'::text, null::uuid)$$,
  'a closed posting carries no company identity'
);

-- Recreating a function drops its grants with it; the Supabase image grants nothing back
-- automatically, so a missing regrant would leave the join page dead for signed-out
-- visitors with a silent 42501.
select function_privs_are(
  'public',
  'posting_preview',
  array['text'],
  'anon',
  array['EXECUTE'],
  'anonymous visitors keep the posting preview capability'
);
select function_privs_are(
  'public',
  'posting_preview',
  array['text'],
  'authenticated',
  array['EXECUTE'],
  'signed-in visitors keep the posting preview capability'
);
select function_privs_are(
  'public',
  'posting_preview',
  array['text'],
  'service_role',
  array['EXECUTE'],
  'the service role keeps the posting preview capability'
);

select * from finish();
rollback;
