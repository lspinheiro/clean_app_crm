begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- CLE-59 retires rotation but preserves the old API as an inert compatibility surface
-- until the posting UI replaces it. The historical row and tenant boundary remain covered.
select has_function(
  'public', 'rotate_company_invite', array['uuid'],
  'the retired rotation API remains an explicit compatibility surface'
);
select ok(
  position('extensions.gen_random_bytes' in (
    select pg_get_functiondef(procedure.oid)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.proname = 'create_posting'
  )) > 0,
  'replacement posting codes use the cryptographic random-byte source'
);
select ok(
  has_function_privilege('authenticated', 'public.create_posting(uuid, posting_intent, text, uuid, uuid, timestamptz, integer)', 'EXECUTE'),
  'authenticated employees receive the posting creation capability'
);
select ok(
  not has_function_privilege('anon', 'public.create_posting(uuid, posting_intent, text, uuid, uuid, timestamptz, integer)', 'EXECUTE'),
  'anonymous visitors cannot create postings'
);

delete from public.company_invites;
insert into public.company_invites (company_id, code)
values ('10000000-0000-4000-8000-000000000010', 'LEGACYLIVE000001');

select results_eq(
  $$select state, company_name, pool_size
      from public.cleaner_invite_preview('LEGACYLIVE000001')$$,
  $$values ('revoked'::text, null::text, 0)$$,
  'a formerly live old link answers with the dead no-longer-active state and no tenant data'
);

create temp table cle_10_postings (id uuid primary key) on commit drop;
grant select, insert on table cle_10_postings to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.rotate_company_invite('10000000-0000-4000-8000-000000000010')$$,
  '23514',
  'Cleaner invitation rotation is retired',
  'an active employee cannot rotate the legacy singleton code'
);
insert into cle_10_postings (id)
values
  (public.create_posting(
    '10000000-0000-4000-8000-000000000010',
    'expression_of_interest',
    'Join our cleaner staff.', null, null, null, null
  )),
  (public.create_posting(
    '10000000-0000-4000-8000-000000000010',
    'expression_of_interest',
    'Join our weekend cleaner staff.', null, null, null, 5
  ));

select is(
  (select count(*)::integer from public.posting_states
    where state = 'active' and id in (select id from cle_10_postings)),
  2,
  'two replacement postings coexist instead of rotating one another'
);
select is(
  (select count(distinct code)::integer from public.posting_states
    where id in (select id from cle_10_postings)),
  2,
  'each replacement posting has an independent link'
);
select ok(
  (select bool_and(code ~ '^[A-Z0-9]{16}$') from public.posting_states
    where id in (select id from cle_10_postings)),
  'replacement posting codes remain high-entropy URL-safe capabilities'
);
select lives_ok(
  $$select public.revoke_posting(
    (select id from cle_10_postings order by id limit 1)
  )$$,
  'an employee can revoke one selected posting'
);
select results_eq(
  $$select state, count(*)::bigint from public.posting_states
     where id in (select id from cle_10_postings)
     group by state order by state$$,
  $$values ('active'::text, 1::bigint), ('dead'::text, 1::bigint)$$,
  'revocation closes only the selected posting'
);
reset role;

create function public.cle_10_force_posting_collision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('cle_10.force_posting_collision', true) = 'on' then
    raise unique_violation using message = 'Forced posting collision';
  end if;
  return new;
end;
$$;
create trigger cle_10_force_posting_collision
before insert on public.postings
for each row execute function public.cle_10_force_posting_collision();

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('cle_10.force_posting_collision', 'on', true);
select throws_ok(
  $$select public.create_posting(
    '10000000-0000-4000-8000-000000000010',
    'expression_of_interest', 'Collision retry.', null, null, null, null
  )$$,
  '23505',
  'Unable to generate a unique posting code',
  'ten exhausted posting-code collisions fail without creating a posting'
);
reset role;
select is(
  (select count(*)::integer from public.postings
    where id in (select id from cle_10_postings)),
  2,
  'an exhausted code retry leaves the existing postings unchanged'
);

drop trigger cle_10_force_posting_collision on public.postings;
drop function public.cle_10_force_posting_collision();

select results_eq(
  $$select count(*)::integer, count(*) filter (where revoked_at is null)::integer
      from public.company_invites
     where company_id = '10000000-0000-4000-8000-000000000010'$$,
  $$values (1, 1)$$,
  'a rejected rotation neither deletes history nor manufactures another old code'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.postings),
  0,
  'a cleaner cannot read raw posting records'
);
select throws_ok(
  $$select public.create_posting(
    '10000000-0000-4000-8000-000000000010',
    'expression_of_interest', 'Unauthorised posting.', null, null, null, null
  )$$,
  '42501',
  'Company admin access required',
  'a cleaner cannot create a posting'
);
select throws_ok(
  $$select public.rotate_company_invite('10000000-0000-4000-8000-000000000010')$$,
  '42501',
  'Company admin access required',
  'a cleaner cannot call even the inert company-scoped rotation capability'
);
reset role;

select * from finish();
rollback;
