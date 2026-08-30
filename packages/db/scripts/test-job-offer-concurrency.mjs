import { spawn, spawnSync } from "node:child_process";

const companyId = "51000000-0000-4000-8000-00000000c010";
const adminId = "51000000-0000-4000-8000-00000000c001";
const cleanerAId = "51000000-0000-4000-8000-00000000c002";
const cleanerBId = "51000000-0000-4000-8000-00000000c003";
const clientId = "51000000-0000-4000-8000-00000000c110";
const siteId = "51000000-0000-4000-8000-00000000c401";
const acceptAssignJobId = "51000000-0000-4000-8000-00000000c501";
const answerRaceJobId = "51000000-0000-4000-8000-00000000c502";
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
      else reject(new Error(stderr.trim() || "Concurrent offer mutation failed."));
    });
  });
}

function expectOneWinner(results, invariantName) {
  const fulfilled = results.filter((result) => result.status === "fulfilled").length;
  const rejected = results.filter((result) => result.status === "rejected").length;
  if (fulfilled !== 1 || rejected !== 1) {
    const details = results
      .map((result) =>
        result.status === "fulfilled" ? "fulfilled" : result.reason.message,
      )
      .join(" | ");
    throw new Error(
      `${invariantName} expected one winner and one rejected transaction: ${details}`,
    );
  }
}

function asAuthenticated(profileId, statement) {
  return `
    begin;
    set local statement_timeout = '10s';
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${profileId}', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    ${statement}
    select pg_sleep(0.75);
    commit;
  `;
}

const cleanupSql = `
  delete from public.jobs where id in ('${acceptAssignJobId}', '${answerRaceJobId}');
  delete from public.companies where id = '${companyId}';
  delete from auth.users where id in ('${adminId}', '${cleanerAId}', '${cleanerBId}');
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
        '${adminId}', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'offer-race-admin@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Offer Race Admin"}', now(), now(), '', '', '', ''
      ),
      (
        '${cleanerAId}', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'offer-race-a@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Offer Race A"}', now(), now(), '', '', '', ''
      ),
      (
        '${cleanerBId}', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'offer-race-b@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Offer Race B"}', now(), now(), '', '', '', ''
      );
    insert into public.companies (id, name, abn, status)
    values ('${companyId}', 'Offer Race Company', '51999999999', 'approved');
    insert into public.employee_memberships (company_id, profile_id, role)
    values ('${companyId}', '${adminId}', 'owner');
    insert into public.company_members (company_id, profile_id)
    values ('${companyId}', '${cleanerAId}'), ('${companyId}', '${cleanerBId}');
    insert into public.clients (id, company_id, name)
    values ('${clientId}', '${companyId}', 'Offer Race Client');
    insert into public.sites (id, client_id, name, address, suburb)
    values ('${siteId}', '${clientId}', 'Offer Race Site', '51 Race Street', 'Robina');
    insert into public.jobs (
      id, site_id, service_id, scheduled_start, duration_minutes,
      cleaner_pay_cents, status, crew_size
    ) values
      (
        '${acceptAssignJobId}', '${siteId}',
        '30000000-0000-4000-8000-000000000002',
        '2099-12-01T08:00:00+10', 120, 10000, 'posted', 1
      ),
      (
        '${answerRaceJobId}', '${siteId}',
        '30000000-0000-4000-8000-000000000002',
        '2099-12-02T08:00:00+10', 120, 10000, 'posted', 1
      );
    commit;
  `);

  const acceptAssignOfferId = runSql(
    asAuthenticated(
      adminId,
      `select public.offer_job('${acceptAssignJobId}', '${cleanerAId}');`,
    ),
  ).split("\n").at(-1);

  runSql(
    asAuthenticated(
      cleanerBId,
      `select public.apply_to_job('${acceptAssignJobId}');`,
    ),
  );

  const acceptAssignResults = await Promise.allSettled([
    runSqlConcurrently(
      asAuthenticated(
        cleanerAId,
        `select public.accept_offer('${acceptAssignOfferId}');`,
      ),
    ),
    runSqlConcurrently(
      asAuthenticated(
        adminId,
        `select public.approve_job_application('${acceptAssignJobId}', 1, '${cleanerBId}');`,
      ),
    ),
  ]);
  expectOneWinner(acceptAssignResults, "Accept-versus-assign race");
  if (
    runSql(`
      select concat_ws(':', offer.status, count(assignment.id), min(assignment.cleaner_id::text))
      from public.offers offer
      left join public.job_assignments assignment
        on assignment.job_id = offer.job_id
       and assignment.unassigned_at is null
      where offer.id = '${acceptAssignOfferId}'
      group by offer.status
    `) !== `accepted:1:${cleanerAId}`
  ) {
    throw new Error("Accept-versus-assign race did not preserve the offered cleaner's place.");
  }

  const answerRaceOfferId = runSql(
    asAuthenticated(
      adminId,
      `select public.offer_job('${answerRaceJobId}', '${cleanerAId}');`,
    ),
  ).split("\n").at(-1);
  const answerResults = await Promise.allSettled([
    runSqlConcurrently(
      asAuthenticated(
        cleanerAId,
        `select public.accept_offer('${answerRaceOfferId}');`,
      ),
    ),
    runSqlConcurrently(
      asAuthenticated(
        cleanerAId,
        `select public.decline_offer('${answerRaceOfferId}');`,
      ),
    ),
  ]);
  expectOneWinner(answerResults, "Two-answer race");

  const answerState = runSql(`
    select concat_ws(
      ':',
      offer.status,
      (offer.resolved_at is not null)::text,
      count(assignment.id)::text,
      count(vacancy.job_id)::text
    )
    from public.offers offer
    left join public.job_assignments assignment
      on assignment.job_id = offer.job_id
     and assignment.unassigned_at is null
    left join public.vacancies vacancy on vacancy.job_id = offer.job_id
    where offer.id = '${answerRaceOfferId}'
    group by offer.status, offer.resolved_at
  `);
  if (answerState !== "accepted:true:1:0" && answerState !== "declined:true:0:1") {
    throw new Error(`Two-answer race left an inconsistent terminal state: ${answerState}`);
  }

  console.log(
    "Job offer concurrency check passed: accept-versus-assign and two-answer races produced exactly one consistent outcome.",
  );
} finally {
  runSql(cleanupSql);
}
