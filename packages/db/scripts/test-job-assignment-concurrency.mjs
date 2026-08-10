import { spawn, spawnSync } from "node:child_process";

const companyId = "60000000-0000-4000-8000-000000000010";
const cleanerAId = "60000000-0000-4000-8000-000000000001";
const cleanerBId = "60000000-0000-4000-8000-000000000002";
const clientId = "60000000-0000-4000-8000-000000000301";
const siteId = "60000000-0000-4000-8000-000000000401";
const jobAId = "60000000-0000-4000-8000-000000000501";
const jobBId = "60000000-0000-4000-8000-000000000502";
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
      else reject(new Error(stderr.trim() || "Concurrent assignment failed."));
    });
  });
}

function expectOneWinner(results, invariantName) {
  const fulfilled = results.filter((result) => result.status === "fulfilled").length;
  const rejected = results.filter((result) => result.status === "rejected").length;
  if (fulfilled !== 1 || rejected !== 1) {
    throw new Error(`${invariantName} expected one winner and one rejected transaction.`);
  }
}

const cleanupSql = `
  delete from public.jobs where id in ('${jobAId}', '${jobBId}');
  delete from public.companies where id = '${companyId}';
  delete from auth.users where id in ('${cleanerAId}', '${cleanerBId}');
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
        '${cleanerAId}',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'assignment-race-a@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Assignment Race A"}', now(), now(), '', '', '', ''
      ),
      (
        '${cleanerBId}',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'assignment-race-b@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Assignment Race B"}', now(), now(), '', '', '', ''
      );
    insert into public.companies (id, name, abn, status)
    values ('${companyId}', 'Assignment Race Company', '66666666666', 'approved');
    insert into public.company_members (company_id, profile_id)
    values ('${companyId}', '${cleanerAId}'), ('${companyId}', '${cleanerBId}');
    insert into public.clients (id, company_id, name)
    values ('${clientId}', '${companyId}', 'Assignment Race Client');
    insert into public.sites (id, client_id, name, address, suburb)
    values ('${siteId}', '${clientId}', 'Assignment Race Site', '1 Test Street', 'Robina');
    insert into public.jobs (
      id, site_id, service_id, scheduled_start, duration_minutes,
      cleaner_pay_cents, status, crew_size
    ) values
      (
        '${jobAId}', '${siteId}', '30000000-0000-4000-8000-000000000002',
        '2026-08-10T08:00:00+10', 120, 10000, 'posted', 1
      ),
      (
        '${jobBId}', '${siteId}', '30000000-0000-4000-8000-000000000002',
        '2026-08-10T09:00:00+10', 120, 10000, 'posted', 1
      );
    commit;
  `);

  const overlappingResults = await Promise.allSettled([
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      insert into public.job_assignments (job_id, slot_number, cleaner_id)
      values ('${jobAId}', 1, '${cleanerAId}');
      select pg_sleep(0.75);
      commit;
    `),
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      insert into public.job_assignments (job_id, slot_number, cleaner_id)
      values ('${jobBId}', 1, '${cleanerAId}');
      select pg_sleep(0.75);
      commit;
    `),
  ]);
  expectOneWinner(overlappingResults, "Cleaner overlap race");
  if (runSql(`select count(*) from public.job_assignments where cleaner_id = '${cleanerAId}'`) !== "1") {
    throw new Error("Cleaner overlap race left more than one active assignment.");
  }

  runSql(`delete from public.job_assignments where job_id in ('${jobAId}', '${jobBId}')`);
  const slotResults = await Promise.allSettled([
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      insert into public.job_assignments (job_id, slot_number, cleaner_id)
      values ('${jobAId}', 1, '${cleanerAId}');
      select pg_sleep(0.75);
      commit;
    `),
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      insert into public.job_assignments (job_id, slot_number, cleaner_id)
      values ('${jobAId}', 1, '${cleanerBId}');
      select pg_sleep(0.75);
      commit;
    `),
  ]);
  expectOneWinner(slotResults, "Crew-slot race");
  if (runSql(`select count(*) from public.job_assignments where job_id = '${jobAId}'`) !== "1") {
    throw new Error("Crew-slot race exceeded the job crew size.");
  }

  runSql(`
    delete from public.job_assignments where job_id in ('${jobAId}', '${jobBId}');
    update public.jobs set crew_size = 2 where id = '${jobAId}';
  `);
  const shrinkResults = await Promise.allSettled([
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      insert into public.job_assignments (job_id, slot_number, cleaner_id)
      values ('${jobAId}', 2, '${cleanerAId}');
      select pg_sleep(0.75);
      commit;
    `),
    runSqlConcurrently(`
      begin;
      set local statement_timeout = '10s';
      update public.jobs set crew_size = 1 where id = '${jobAId}';
      select pg_sleep(0.75);
      commit;
    `),
  ]);
  expectOneWinner(shrinkResults, "Assignment-versus-crew-shrink race");
  if (
    runSql(`
      select count(*)
      from public.job_assignments assignment
      join public.jobs job on job.id = assignment.job_id
      where assignment.job_id = '${jobAId}'
        and assignment.unassigned_at is null
        and assignment.slot_number > job.crew_size
    `) !== "0"
  ) {
    throw new Error("Assignment-versus-crew-shrink race left an out-of-range slot.");
  }

  console.log(
    "Job assignment concurrency check passed: overlap, crew-slot, and crew-shrink races preserved their invariants.",
  );
} finally {
  runSql(cleanupSql);
}
