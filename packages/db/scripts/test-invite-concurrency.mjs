import { spawn, spawnSync } from "node:child_process";

const adminId = "59000000-0000-4000-8000-000000000901";
const firstCandidateId = "59000000-0000-4000-8000-000000000902";
const secondCandidateId = "59000000-0000-4000-8000-000000000903";
const companyId = "59000000-0000-4000-8000-000000000910";
const postingId = "59000000-0000-4000-8000-000000000920";
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

function runSqlConcurrently(candidateId, name) {
  return new Promise((resolve, reject) => {
    const sql = `
      begin;
      set local statement_timeout = '10s';
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${candidateId}', true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      select public.apply_to_posting(
        'CLE59RACECAP0001', '${name}', '+61 400 590 999', 'Miami', null
      );
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
      else reject(new Error(stderr.trim() || "Concurrent posting application failed."));
    });
  });
}

const cleanupSql = `
  delete from public.job_applications where posting_id = '${postingId}';
  delete from public.join_requests where company_id = '${companyId}';
  delete from public.companies where id = '${companyId}';
  delete from auth.users where id in ('${adminId}', '${firstCandidateId}', '${secondCandidateId}');
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
        'authenticated', 'authenticated', 'cle-59-race-admin@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Posting Race Admin"}', now(), now(), '', '', '', ''
      ),
      (
        '${firstCandidateId}', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'cle-59-race-one@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Race Candidate One"}', now(), now(), '', '', '', ''
      ),
      (
        '${secondCandidateId}', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'cle-59-race-two@example.test',
        extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Race Candidate Two"}', now(), now(), '', '', '', ''
      );
    insert into public.companies (id, name, abn, status)
    values ('${companyId}', 'Posting Race Company', '59000000910', 'approved');
    insert into public.employee_memberships (company_id, profile_id, role)
    values ('${companyId}', '${adminId}', 'owner');
    insert into public.postings (
      id, company_id, code, intent, public_description, application_cap
    ) values (
      '${postingId}', '${companyId}', 'CLE59RACECAP0001',
      'expression_of_interest', 'One capped application.', 1
    );
    commit;
  `);

  const results = await Promise.allSettled([
    runSqlConcurrently(firstCandidateId, "Race Candidate One"),
    runSqlConcurrently(secondCandidateId, "Race Candidate Two"),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled").length;
  const rejected = results.filter((result) => result.status === "rejected").length;
  if (fulfilled !== 1 || rejected !== 1) {
    throw new Error("Last capped place expected exactly one committed application.");
  }
  const loser = results.find((result) => result.status === "rejected");
  const loserMessage = loser?.reason instanceof Error ? loser.reason.message : "";
  if (!/Posting is no longer active/.test(loserMessage)) {
    throw new Error(`Capped race rejected for an unexpected reason: ${loserMessage}`);
  }

  const finalState = runSql(`
    select concat_ws(
      '|',
      (select count(*) from public.job_applications where posting_id = '${postingId}'),
      (select count(*) from public.join_requests where company_id = '${companyId}'),
      (select state || ':' || closing_reason from public.posting_states
        where id = '${postingId}')
    )
  `);
  if (finalState !== "1|1|dead:cap_reached") {
    throw new Error(`Capped race left inconsistent state: ${finalState || "no rows"}`);
  }

  console.log(
    "Posting cap concurrency check passed: exactly one application took the last place.",
  );
} finally {
  runSql(cleanupSql);
}
