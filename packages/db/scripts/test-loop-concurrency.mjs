import { spawn, spawnSync } from "node:child_process";

const adminId = "10000000-0000-4000-8000-000000000001";
const cleanerAId = "10000000-0000-4000-8000-000000000002";
const cleanerBId = "10000000-0000-4000-8000-000000000003";
const cleanerCId = "10000000-0000-4000-8000-000000000004";
const siteId = "10000000-0000-4000-8000-000000000401";
const serviceId = "30000000-0000-4000-8000-000000000002";
const applyJobId = "69000000-0000-4000-8000-000000000501";
const finalSlotJobId = "69000000-0000-4000-8000-000000000502";
const membershipRaceJobId = "69000000-0000-4000-8000-000000000503";
const membershipRaceCleanerId = "69000000-0000-4000-8000-000000000003";
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
      else reject(new Error(stderr.trim() || "Concurrent loop mutation failed."));
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

function internalAssignmentTransaction(userId, statement) {
  return `
    begin;
    set local role service_role;
    select set_config('request.jwt.claim.sub', '${userId}', true);
    select set_config('request.jwt.claim.role', 'service_role', true);
    ${statement}
    select pg_sleep(0.75);
    commit;
  `;
}

const cleanupSql = `
  delete from public.jobs
  where id in ('${applyJobId}', '${finalSlotJobId}', '${membershipRaceJobId}');
  delete from public.company_members
  where profile_id = '${membershipRaceCleanerId}';
  delete from auth.users
  where id = '${membershipRaceCleanerId}';
`;

try {
  runSql(`
    begin;
    ${cleanupSql}
    insert into public.jobs (
      id, site_id, service_id, scheduled_start, duration_minutes,
      cleaner_pay_cents, status, crew_size
    ) values
      (
        '${applyJobId}', '${siteId}', '${serviceId}',
        '2099-09-01T08:00:00+10', 60, 9000, 'posted', 1
      ),
      (
        '${finalSlotJobId}', '${siteId}', '${serviceId}',
        '2099-09-01T12:00:00+10', 60, 9000, 'posted', 2
      ),
      (
        '${membershipRaceJobId}', '${siteId}', '${serviceId}',
        '2099-09-02T08:00:00+10', 60, 9000, 'posted', 1
      );
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '${membershipRaceCleanerId}',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'cle49-membership-race@example.test',
      crypt('local-test-only', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"CLE-49 Membership Race"}', now(), now(), '', '', '', ''
    );
    insert into public.company_members (company_id, profile_id)
    values ('10000000-0000-4000-8000-000000000010', '${membershipRaceCleanerId}');
    insert into public.job_assignments (job_id, slot_number, cleaner_id)
    values ('${finalSlotJobId}', 1, '${cleanerCId}');
    insert into public.job_applications (job_id, cleaner_id)
    values
      ('${finalSlotJobId}', '${cleanerAId}'),
      ('${finalSlotJobId}', '${cleanerBId}');
    commit;
  `);

  const applicationResults = await Promise.allSettled([
    runSqlConcurrently(
      authenticatedTransaction(
        cleanerAId,
        `select public.apply_to_job('${applyJobId}');`,
      ),
    ),
    runSqlConcurrently(
      authenticatedTransaction(
        cleanerAId,
        `select public.apply_to_job('${applyJobId}');`,
      ),
    ),
  ]);
  expectOneWinner(
    applicationResults,
    "Concurrent apply-once race",
    /Cleaner can apply only once per job/,
  );
  if (
    runSql(`
      select count(*)
      from public.job_applications
      where job_id = '${applyJobId}'
        and cleaner_id = '${cleanerAId}'
        and status = 'applied'
    `) !== "1"
  ) {
    throw new Error("Concurrent applications did not preserve one permanent application row.");
  }

  const finalSlotResults = await Promise.allSettled([
    runSqlConcurrently(
      authenticatedTransaction(
        adminId,
        `select public.approve_job_application('${finalSlotJobId}', 2, '${cleanerAId}');`,
      ),
    ),
    runSqlConcurrently(
      authenticatedTransaction(
        adminId,
        `select public.approve_job_application('${finalSlotJobId}', 2, '${cleanerBId}');`,
      ),
    ),
  ]);
  expectOneWinner(
    finalSlotResults,
    "Concurrent final-slot race",
    /Application is no longer awaiting review/,
  );

  if (
    runSql(`
      select concat_ws(
        '|',
        (select status::text from public.jobs where id = '${finalSlotJobId}'),
        (select count(*) from public.job_assignments
          where job_id = '${finalSlotJobId}' and unassigned_at is null),
        (select count(*) from public.job_applications
          where job_id = '${finalSlotJobId}' and status = 'assigned'),
        (select count(*) from public.job_applications
          where job_id = '${finalSlotJobId}' and status = 'not_selected'),
        (select count(*) from public.notifications
          where job_id = '${finalSlotJobId}' and type = 'job_assigned')
      )
    `) !== "assigned|2|1|1|1"
  ) {
    throw new Error("Final-slot race did not atomically resolve assignment state and notification.");
  }
  if (
    runSql(`
      select (
        (select cleaner_id from public.job_assignments
          where job_id = '${finalSlotJobId}' and slot_number = 2 and unassigned_at is null)
          =
        (select cleaner_id from public.job_applications
          where job_id = '${finalSlotJobId}' and status = 'assigned')
        and
        (select cleaner_id from public.job_assignments
          where job_id = '${finalSlotJobId}' and slot_number = 2 and unassigned_at is null)
          =
        (select recipient_id from public.notifications
          where job_id = '${finalSlotJobId}' and type = 'job_assigned')
        and
        (select cleaner_id from public.job_applications
          where job_id = '${finalSlotJobId}' and status = 'not_selected')
          <>
        (select cleaner_id from public.job_applications
          where job_id = '${finalSlotJobId}' and status = 'assigned')
      )
    `) !== "t"
  ) {
    throw new Error("Final-slot race resolved the wrong applicant or notification recipient.");
  }

  const membershipRaceResults = await Promise.allSettled([
    runSqlConcurrently(
      internalAssignmentTransaction(
        adminId,
        `select public.assign_job_slot('${membershipRaceJobId}', 1, '${membershipRaceCleanerId}');`,
      ),
    ),
    runSqlConcurrently(`
      begin;
      update public.company_members
      set status = 'removed'
      where company_id = '10000000-0000-4000-8000-000000000010'
        and profile_id = '${membershipRaceCleanerId}';
      select pg_sleep(0.75);
      commit;
    `),
  ]);
  if (membershipRaceResults[1]?.status !== "fulfilled") {
    throw new Error("Concurrent membership removal did not commit successfully.");
  }
  const assignmentRaceResult = membershipRaceResults[0];
  if (
    assignmentRaceResult?.status === "rejected"
    && !/Cleaner is not an active pool member/.test(
      assignmentRaceResult.reason instanceof Error ? assignmentRaceResult.reason.message : "",
    )
  ) {
    throw new Error("Concurrent assignment rejected for an unexpected reason.");
  }
  if (
    runSql(`
      select concat_ws(
        '|',
        (select status::text from public.company_members
          where company_id = '10000000-0000-4000-8000-000000000010'
            and profile_id = '${membershipRaceCleanerId}'),
        (select status::text from public.jobs where id = '${membershipRaceJobId}'),
        (select count(*) from public.job_assignments
          where job_id = '${membershipRaceJobId}' and unassigned_at is null)
      )
    `) !== "removed|posted|0"
  ) {
    throw new Error("Membership-removal race left an ineligible cleaner or filled slot behind.");
  }

  console.log(
    "Loop concurrency check passed: apply-once, final-slot, and membership-removal races preserved their invariants.",
  );
} finally {
  runSql(cleanupSql);
}
