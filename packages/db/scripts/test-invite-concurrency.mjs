import { spawn, spawnSync } from "node:child_process";

const adminId = "40000000-0000-4000-8000-000000000001";
const companyId = "40000000-0000-4000-8000-000000000010";
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
    {
      encoding: "utf8",
    },
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
      else reject(new Error(stderr.trim() || "Concurrent invite rotation failed."));
    });
  });
}

const cleanupSql = `
  delete from public.companies where id = '${companyId}';
  delete from auth.users where id = '${adminId}';
`;

try {
  runSql(`
    begin;
    ${cleanupSql}
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '${adminId}',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'invite-race-admin@example.test',
      extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Invite Race Admin"}', now(), now(), '', '', '', ''
    );
    insert into public.companies (id, name, abn, status)
    values ('${companyId}', 'Invite Race Company', '44444444444', 'approved');
    insert into public.employee_memberships (company_id, profile_id, role)
    values ('${companyId}', '${adminId}', 'owner');
    insert into public.company_invites (company_id, code)
    values ('${companyId}', 'RACE01');
    commit;
  `);

  const rotationSql = `
    begin;
    set local statement_timeout = '10s';
    set local role authenticated;
    set local "request.jwt.claim.sub" = '${adminId}';
    set local "request.jwt.claim.role" = 'authenticated';
    select (public.rotate_company_invite('${companyId}')).code;
    select pg_sleep(0.75);
    commit;
  `;
  const outputs = await Promise.all([
    runSqlConcurrently(rotationSql),
    runSqlConcurrently(rotationSql),
  ]);
  const codes = outputs.flatMap((output) =>
    output.split("\n").map((line) => line.trim()).filter((line) => /^[A-Z0-9]{6}$/.test(line)),
  );
  if (codes.length !== 2 || new Set(codes).size !== 2) {
    throw new Error("Concurrent rotations did not return two distinct invite codes.");
  }

  const summary = runSql(`
    select
      count(*)::integer,
      count(*) filter (where revoked_at is null)::integer,
      count(*) filter (where revoked_at is not null)::integer,
      count(distinct code)::integer
    from public.company_invites
    where company_id = '${companyId}';
  `);
  if (summary !== "3|1|2|3") {
    throw new Error(`Concurrent rotation invariant failed: ${summary || "no rows"}`);
  }

  console.log("Invite concurrency check passed: two rotations, one active code, full history.");
} finally {
  runSql(cleanupSql);
}
