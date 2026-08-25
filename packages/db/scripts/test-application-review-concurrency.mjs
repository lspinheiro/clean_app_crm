import { spawn, spawnSync } from "node:child_process";

const adminId = "10000000-0000-4000-8000-000000000001";
const cleanerId = "10000000-0000-4000-8000-000000000002";
const jobId = "86000000-0000-4000-8000-000000000590";
const databaseContainer = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_clean_app_crm";
const databaseName = process.env.SUPABASE_DB_NAME ?? "postgres";
const psqlArgs = [
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "postgres",
  "-d",
  databaseName,
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

function runSqlConcurrently(statement) {
  return new Promise((resolve, reject) => {
    const sql = `
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${adminId}', true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      ${statement}
      select pg_sleep(0.75);
      commit;
    `;
    const child = spawn(
      "docker",
      ["exec", "-i", databaseContainer, "psql", ...psqlArgs, "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) resolve();
      else reject(new Error(stderr.trim() || "Concurrent application review failed."));
    });
  });
}

const cleanupSql = `delete from public.jobs where id = '${jobId}';`;

try {
  runSql(`
    begin;
    ${cleanupSql}
    insert into public.jobs (
      id, site_id, service_id, scheduled_start, duration_minutes,
      cleaner_pay_cents, client_charge_cents, status, crew_size
    ) values (
      '${jobId}',
      '10000000-0000-4000-8000-000000000401',
      '30000000-0000-4000-8000-000000000002',
      '2099-10-03T08:00:00+10', 60, 9000, 15000, 'posted', 1
    );
    insert into public.job_applications (job_id, cleaner_id)
    values ('${jobId}', '${cleanerId}');
    commit;
  `);

  const results = await Promise.allSettled([
    runSqlConcurrently(
      `select public.approve_job_application('${jobId}', 1, '${cleanerId}');`,
    ),
    runSqlConcurrently(
      `select public.mark_job_application_not_selected('${jobId}', '${cleanerId}');`,
    ),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled").length;
  const rejected = results.filter((result) => result.status === "rejected").length;
  if (fulfilled !== 1 || rejected !== 1) {
    throw new Error("Approve-versus-not-selected race expected one committed review outcome.");
  }
  const loser = results.find((result) => result.status === "rejected");
  const loserMessage = loser?.reason instanceof Error ? loser.reason.message : "";
  if (!/Application is no longer awaiting review/.test(loserMessage)) {
    throw new Error(`Review race rejected for an unexpected reason: ${loserMessage}`);
  }

  const finalState = runSql(`
    select concat_ws(
      '|',
      application.status::text,
      (select count(*) from public.job_assignments assignment
        where assignment.job_id = application.job_id and assignment.unassigned_at is null),
      (select count(*) from public.vacancies vacancy where vacancy.job_id = application.job_id)
    )
    from public.job_applications application
    where application.job_id = '${jobId}' and application.cleaner_id = '${cleanerId}'
  `);
  if (!new Set(["assigned|1|0", "not_selected|0|1"]).has(finalState)) {
    throw new Error(`Review race left an inconsistent application/job state: ${finalState}`);
  }

  console.log(
    "Application review concurrency check passed: approve and not-selected produced one consistent winner.",
  );
} finally {
  runSql(cleanupSql);
}
