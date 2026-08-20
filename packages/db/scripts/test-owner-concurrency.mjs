import { spawn, spawnSync } from "node:child_process";

const ownerAId = "81000000-0000-4000-8000-000000000101";
const ownerBId = "81000000-0000-4000-8000-000000000102";
const companyId = "81000000-0000-4000-8000-000000000110";
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
      else reject(new Error(stderr.trim() || "Concurrent owner mutation failed."));
    });
  });
}

const cleanupSql = `
  delete from public.companies where id = '${companyId}';
  delete from auth.users where id in ('${ownerAId}', '${ownerBId}');
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
        '${ownerAId}',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'owner-a-race@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Owner A Race"}', now(), now(), '', '', '', ''
      ),
      (
        '${ownerBId}',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'owner-b-race@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Owner B Race"}', now(), now(), '', '', '', ''
      );
    insert into public.companies (id, name, abn, status)
    values ('${companyId}', 'Owner Race Company', '81999999999', 'approved');
    insert into public.employee_memberships (company_id, profile_id, role)
    values
      ('${companyId}', '${ownerAId}', 'owner'),
      ('${companyId}', '${ownerBId}', 'owner');
    commit;
  `);

  const results = await Promise.allSettled([
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${ownerAId}', true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      select public.remove_employee(
        '${companyId}',
        (select id from public.employee_memberships
         where company_id = '${companyId}' and profile_id = '${ownerAId}')
      );
      select pg_sleep(0.75);
      commit;
    `),
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${ownerBId}', true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      select public.remove_employee(
        '${companyId}',
        (select id from public.employee_memberships
         where company_id = '${companyId}' and profile_id = '${ownerBId}')
      );
      select pg_sleep(0.75);
      commit;
    `),
  ]);

  const fulfilled = results.filter((result) => result.status === "fulfilled").length;
  const rejected = results.filter((result) => result.status === "rejected").length;
  const loser = results.find((result) => result.status === "rejected");
  const loserMessage = loser?.reason instanceof Error ? loser.reason.message : "";
  if (
    fulfilled !== 1 ||
    rejected !== 1 ||
    !/Company must retain at least one active owner/.test(loserMessage)
  ) {
    throw new Error("Concurrent owner-removal RPCs did not produce one protected owner.");
  }

  const activeOwners = runSql(`
    select count(*)
    from public.employee_memberships
    where company_id = '${companyId}'
      and role = 'owner'
      and status = 'active';
  `);
  if (activeOwners !== "1") {
    throw new Error(`Concurrent owner removal left ${activeOwners || "no"} active owners.`);
  }

  console.log("Owner RPC concurrency check passed: one removal won and one active owner remains.");
} finally {
  runSql(cleanupSql);
}
