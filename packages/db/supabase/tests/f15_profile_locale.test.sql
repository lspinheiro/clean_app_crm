begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select has_type(
  'public',
  'app_locale',
  'supported application locales have a database type'
);

select is(
  (
    select string_agg(enum_value.enumlabel::text, ',' order by enum_value.enumsortorder)
    from pg_type type
    join pg_enum enum_value on enum_value.enumtypid = type.oid
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public'
      and type.typname = 'app_locale'
  ),
  'en-AU,pt-BR',
  'only the two alpha locales are accepted'
);

select has_column(
  'public',
  'profiles',
  'preferred_locale',
  'profiles can persist one preferred locale for both application roles'
);

select is(
  (
    select (columns.udt_schema || '.' || columns.udt_name)::text
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'profiles'
      and columns.column_name = 'preferred_locale'
  ),
  'public.app_locale'::text,
  'the profile preference uses the supported-locale enum'
);

select is(
  (
    select columns.is_nullable::text
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'profiles'
      and columns.column_name = 'preferred_locale'
  ),
  'YES'::text,
  'no stored preference remains distinct from an explicit English choice'
);

select is(
  (
    select columns.column_default::text
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'profiles'
      and columns.column_name = 'preferred_locale'
  ),
  null::text,
  'existing profiles are not silently converted into explicit English preferences'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated users cannot mutate profile columns directly'
);

select has_function(
  'public',
  'set_preferred_locale',
  array['public.app_locale'],
  'a self-scoped preference RPC exists'
);

select ok(
  coalesce(
    (
      select has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'set_preferred_locale'
    ),
    false
  ),
  'authenticated users can persist their own preference'
);

select ok(
  coalesce(
    (
      select not has_function_privilege('anon', procedure.oid, 'EXECUTE')
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'set_preferred_locale'
    ),
    false
  ),
  'anonymous users cannot persist a profile preference'
);

select ok(
  coalesce(
    (
      select has_function_privilege('service_role', procedure.oid, 'EXECUTE')
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'set_preferred_locale'
    ),
    false
  ),
  'service role has an explicit RPC grant'
);

select * from finish();

rollback;
