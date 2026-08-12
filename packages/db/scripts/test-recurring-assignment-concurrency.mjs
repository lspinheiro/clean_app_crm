import { spawn, spawnSync } from "node:child_process";

const adminId = "62000000-0000-4000-8000-000000000001";
const cleanerId = "62000000-0000-4000-8000-000000000002";
const companyId = "62000000-0000-4000-8000-000000000010";
const clientId = "62000000-0000-4000-8000-000000000301";
const siteId = "62000000-0000-4000-8000-000000000401";
const databaseContainer = "supabase_db_clean_app_crm";
const psqlArgs = [
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "postgres",
  "-d",
  "postgres",
];

function runSql(sql) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", databaseContainer, "psql", ...psqlArgs, "-c", sql],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Local PostgreSQL command failed.");
  }
  return result.stdout.trim();
}

function runSqlConcurrently(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", databaseContainer, "psql", ...psqlArgs, "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || "Concurrent recurring mutation failed."));
    });
  });
}

const cleanupSql = `
  -- jobs.recurring_assignment_id is ON DELETE RESTRICT by design, so the instances the rule
  -- generated have to go first or teardown fails once generation has run.
  delete from public.jobs where site_id = '${siteId}';
  delete from public.recurring_assignments where site_id = '${siteId}';
  delete from public.companies where id = '${companyId}';
  delete from auth.users where id in ('${adminId}', '${cleanerId}');
`;

try {
  runSql(`
    begin;
    ${cleanupSql}
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values
      (
        '${adminId}',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'recurring-race-admin@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Recurring Race Admin"}', now(), now(), '', '', '', ''
      ),
      (
        '${cleanerId}',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'recurring-race-cleaner@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Recurring Race Cleaner"}', now(), now(), '', '', '', ''
      );
    update public.profiles set role = 'company_admin' where id = '${adminId}';
    insert into public.companies (id, name, abn, status)
    values ('${companyId}', 'Recurring Race Company', '62626262626', 'approved');
    insert into public.company_members (company_id, profile_id)
    values ('${companyId}', '${adminId}'), ('${companyId}', '${cleanerId}');
    insert into public.clients (id, company_id, name)
    values ('${clientId}', '${companyId}', 'Recurring Race Client');
    insert into public.sites (id, client_id, name, address, suburb)
    values ('${siteId}', '${clientId}', 'Recurring Race Site', '1 Test Street', 'Robina');
    commit;
  `);

  const results = await Promise.allSettled([
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${adminId}', true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      select public.create_recurring_assignment(
        '${siteId}',
        '30000000-0000-4000-8000-000000000002',
        'weekly', 2::smallint, '2026-08-11', '08:00', 60, 8000, 1,
        array['${cleanerId}'::uuid]
      );
      select pg_sleep(0.75);
      commit;
    `),
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      update public.company_members
      set status = 'removed'
      where company_id = '${companyId}' and profile_id = '${cleanerId}';
      select pg_sleep(0.75);
      commit;
    `),
  ]);

  if (results[1].status !== "fulfilled") {
    throw new Error("Pool-member removal did not complete during the named-slot race.");
  }
  if (
    runSql(`
      select count(*)
      from public.recurring_assignment_cleaners named
      join public.recurring_assignments rule on rule.id = named.recurring_assignment_id
      join public.sites site on site.id = rule.site_id
      join public.clients client on client.id = site.client_id
      where client.company_id = '${companyId}'
        and not exists (
          select 1
          from public.profiles profile
          join public.company_members membership on membership.profile_id = profile.id
          where profile.id = named.cleaner_id
            and profile.role = 'cleaner'
            and membership.company_id = client.company_id
            and membership.status = 'active'
        )
    `) !== "0"
  ) {
    throw new Error("Named-slot race left an ineligible cleaner on a recurring rule.");
  }

  console.log(
    "Recurring assignment concurrency check passed: pool removal left no ineligible named slot.",
  );
} finally {
  runSql(cleanupSql);
}
