import { spawn, spawnSync } from "node:child_process";

const adminId = "63000000-0000-4000-8000-000000000001";
const cleanerId = "63000000-0000-4000-8000-000000000002";
const companyId = "63000000-0000-4000-8000-000000000010";
const clientId = "63000000-0000-4000-8000-000000000301";
const siteId = "63000000-0000-4000-8000-000000000401";
const ruleId = "63000000-0000-4000-8000-000000000701";
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
      else reject(new Error(stderr.trim() || "Concurrent generation failed."));
    });
  });
}

const cleanupSql = `
  delete from public.job_assignments
  where job_id in (
    select id from public.jobs where recurring_assignment_id = '${ruleId}'
  );
  delete from public.jobs where recurring_assignment_id = '${ruleId}';
  delete from public.recurring_assignments where id = '${ruleId}';
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
        'authenticated', 'authenticated', 'generation-race-admin@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Generation Race Admin"}', now(), now(), '', '', '', ''
      ),
      (
        '${cleanerId}',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'generation-race-cleaner@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Generation Race Cleaner"}', now(), now(), '', '', '', ''
      );
    insert into public.companies (id, name, abn, status)
    values ('${companyId}', 'Generation Race Company', '63636363636', 'approved');
    insert into public.employee_memberships (company_id, profile_id, role)
    values ('${companyId}', '${adminId}', 'owner');
    insert into public.company_members (company_id, profile_id)
    values ('${companyId}', '${cleanerId}');
    insert into public.clients (id, company_id, name)
    values ('${clientId}', '${companyId}', 'Generation Race Client');
    insert into public.sites (id, client_id, name, address, suburb)
    values ('${siteId}', '${clientId}', 'Generation Race Site', '1 Test Street', 'Robina');
    insert into public.recurring_assignments (
      id, site_id, service_id, frequency, weekday, anchor_date,
      local_start_time, duration_minutes, cleaner_pay_cents, crew_size
    ) values (
      '${ruleId}', '${siteId}', '30000000-0000-4000-8000-000000000002',
      'weekly', 1, '2026-08-10', '20:00', 60, 9000, 2
    );
    insert into public.recurring_assignment_cleaners (
      recurring_assignment_id, slot_number, cleaner_id, accepted_at
    ) values ('${ruleId}', 1, '${cleanerId}', clock_timestamp());
    commit;
  `);

  const results = await Promise.allSettled([
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      select public.generate_recurring_jobs_at(
        '2026-08-09T14:30:00Z', '${ruleId}'
      );
      select pg_sleep(0.75);
      commit;
    `),
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      select public.generate_recurring_jobs_at(
        '2026-08-09T14:30:00Z', '${ruleId}'
      );
      commit;
    `),
  ]);

  if (results.some((result) => result.status !== "fulfilled")) {
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason.message)
      .join("\n");
    throw new Error(`Concurrent generation did not complete cleanly:\n${failures}`);
  }

  const shape = runSql(`
    select
      count(distinct job.id),
      count(distinct assignment.id) filter (where assignment.unassigned_at is null),
      count(distinct (vacancy.job_id, vacancy.crew_slot)),
      count(*) = count(distinct job.service_date)
    from public.jobs job
    left join public.job_assignments assignment on assignment.job_id = job.id
    left join public.vacancies vacancy on vacancy.job_id = job.id
    where job.recurring_assignment_id = '${ruleId}';
  `);
  if (shape !== "4|4|4|t") {
    throw new Error(`Concurrent generation left an invalid roster shape: ${shape}`);
  }

  console.log(
    "Generation concurrency check passed: concurrent runs produced four unique jobs, four named assignments, and four vacancies.",
  );
} finally {
  runSql(cleanupSql);
}
