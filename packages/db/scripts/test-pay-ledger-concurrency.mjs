import { spawn, spawnSync } from "node:child_process";

const adminId = "10000000-0000-4000-8000-000000000001";
const cleanerAId = "10000000-0000-4000-8000-000000000002";
const cleanerBId = "10000000-0000-4000-8000-000000000003";
const siteId = "10000000-0000-4000-8000-000000000401";
const serviceId = "30000000-0000-4000-8000-000000000002";
const jobId = "70000000-0000-4000-8000-000000000501";
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
      else reject(new Error(stderr.trim() || "Concurrent ledger mutation failed."));
    });
  });
}

function expectOneWinner(results, invariantName, expectedLoserMessage) {
  const fulfilled = results.filter((result) => result.status === "fulfilled").length;
  const rejected = results.filter((result) => result.status === "rejected").length;
  if (fulfilled !== 1 || rejected !== 1) {
    throw new Error(`${invariantName} expected one winner and one rejected transaction.`);
  }

  const loser = results.find((result) => result.status === "rejected");
  const loserMessage = loser?.reason instanceof Error ? loser.reason.message : "";
  if (!expectedLoserMessage.test(loserMessage)) {
    throw new Error(
      `${invariantName} rejected for an unexpected reason: ${loserMessage || "unknown error"}`,
    );
  }
}

function authenticatedTransaction(userId, statement) {
  return `
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${userId}', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    ${statement}
    select pg_sleep(0.75);
    commit;
  `;
}

const cleanupSql = `
  delete from public.notifications where job_id = '${jobId}';
  delete from public.ledger_entries where job_id = '${jobId}';
  delete from public.jobs where id = '${jobId}';
`;

try {
  runSql(`
    begin;
    ${cleanupSql}
    insert into public.jobs (
      id, site_id, service_id, scheduled_start, duration_minutes,
      cleaner_pay_cents, status, crew_size
    ) values (
      '${jobId}', '${siteId}', '${serviceId}',
      '2099-11-01T08:00:00+10', 60, 12000, 'in_progress', 2
    );
    insert into public.job_assignments (job_id, slot_number, cleaner_id)
    values
      ('${jobId}', 1, '${cleanerAId}'),
      ('${jobId}', 2, '${cleanerBId}');
    commit;
  `);

  const completionResults = await Promise.allSettled([
    runSqlConcurrently(
      authenticatedTransaction(
        cleanerAId,
        `select public.update_job_status('${jobId}', 'completed');`,
      ),
    ),
    runSqlConcurrently(
      authenticatedTransaction(
        cleanerBId,
        `select public.update_job_status('${jobId}', 'completed');`,
      ),
    ),
  ]);
  expectOneWinner(
    completionResults,
    "Concurrent crew completion",
    /Invalid job status transition/,
  );
  if (
    runSql(`
      select concat_ws(
        '|',
        (select status::text from public.jobs where id = '${jobId}'),
        (select count(*) from public.ledger_entries where job_id = '${jobId}'),
        (select count(distinct cleaner_id) from public.ledger_entries where job_id = '${jobId}'),
        (select coalesce(sum(amount_cents), 0) from public.ledger_entries where job_id = '${jobId}')
      )
    `) !== "completed|2|2|24000"
  ) {
    throw new Error("Concurrent completion did not create exactly two distinct owed entries.");
  }

  const targetLedgerEntryId = runSql(`
    select id
    from public.ledger_entries
    where job_id = '${jobId}'
      and cleaner_id = '${cleanerAId}'
  `);
  const settlementResults = await Promise.allSettled([
    runSqlConcurrently(
      authenticatedTransaction(
        adminId,
        `select public.mark_ledger_paid('${targetLedgerEntryId}', null);`,
      ),
    ),
    runSqlConcurrently(
      authenticatedTransaction(
        adminId,
        `select public.mark_ledger_paid('${targetLedgerEntryId}', null);`,
      ),
    ),
  ]);
  expectOneWinner(
    settlementResults,
    "Concurrent settlement",
    /Ledger entry is already paid/,
  );
  if (
    runSql(`
      select concat_ws(
        '|',
        (select status::text from public.ledger_entries where id = '${targetLedgerEntryId}'),
        (select (paid_at is not null)::text from public.ledger_entries where id = '${targetLedgerEntryId}'),
        (select count(*) from public.notifications where ledger_entry_id = '${targetLedgerEntryId}')
      )
    `) !== "paid|true|1"
  ) {
    throw new Error("Concurrent settlement did not preserve one paid row and notification.");
  }

  console.log(
    "Pay ledger concurrency check passed: completion and settlement races preserved their invariants.",
  );
} finally {
  runSql(cleanupSql);
}
