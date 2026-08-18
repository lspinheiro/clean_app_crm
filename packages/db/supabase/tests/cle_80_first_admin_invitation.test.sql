begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_table(
  'public',
  'first_admin_invitations',
  'the application owns first-admin invitation state'
);

select has_column(
  'public',
  'first_admin_invitations',
  'email',
  'the invitation records the normalised e-mail'
);

select has_column(
  'public',
  'first_admin_invitations',
  'accepted_by_profile_id',
  'the accepted invitation records its profile'
);

select has_column(
  'public',
  'first_admin_invitations',
  'company_id',
  'the accepted invitation records its company'
);

select has_function(
  'public',
  'prepare_first_admin_invitation',
  array['text', 'public.app_locale', 'text', 'timestamp with time zone'],
  'the trusted command can prepare one invitation through an RPC'
);

select has_function(
  'public',
  'revoke_first_admin_invitation',
  array['uuid'],
  'the trusted command can revoke a failed preparation'
);

select has_function(
  'public',
  'get_first_admin_invitation_context',
  array[]::text[],
  'the acceptance page can read caller-scoped invitation context'
);

select has_function(
  'public',
  'accept_first_admin_invitation',
  array['text', 'text', 'text', 'text', 'public.app_locale'],
  'the invited user can accept through one atomic RPC'
);

select results_eq(
  $$select relrowsecurity from pg_class where oid = to_regclass('public.first_admin_invitations')$$,
  array[true],
  'first-admin invitations have RLS enabled'
);

select ok(
  not coalesce(has_table_privilege('authenticated', to_regclass('public.first_admin_invitations'), 'SELECT'), false),
  'authenticated users cannot select invitation rows directly'
);

select ok(
  not coalesce(has_table_privilege('authenticated', to_regclass('public.first_admin_invitations'), 'INSERT,UPDATE,DELETE'), false),
  'authenticated users cannot mutate invitation rows directly'
);

select ok(
  coalesce(has_table_privilege('service_role', to_regclass('public.first_admin_invitations'), 'SELECT,INSERT,UPDATE,DELETE'), false),
  'service role has explicit invitation table access'
);

select ok(
  not coalesce(
    (
      select has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'prepare_first_admin_invitation'
    ),
    false
  ),
  'the browser cannot prepare invitations'
);

select ok(
  coalesce(
    (
      select has_function_privilege('service_role', procedure.oid, 'EXECUTE')
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'prepare_first_admin_invitation'
    ),
    false
  ),
  'service role can prepare invitations explicitly'
);

select ok(
  coalesce(
    (
      select has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'accept_first_admin_invitation'
    ),
    false
  ),
  'authenticated invitees can call the acceptance RPC'
);

select ok(
  not coalesce(
    (
      select has_function_privilege('anon', procedure.oid, 'EXECUTE')
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'accept_first_admin_invitation'
    ),
    false
  ),
  'anonymous users cannot call the acceptance RPC'
);

select * from finish();

rollback;
