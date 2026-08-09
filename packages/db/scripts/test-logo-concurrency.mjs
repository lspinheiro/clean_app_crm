import { spawn, spawnSync } from "node:child_process";

const adminId = "50000000-0000-4000-8000-000000000001";
const companyId = "50000000-0000-4000-8000-000000000010";
const databaseContainer = "supabase_db_clean_app_crm";
const candidateA = `${companyId}/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
const candidateB = `${companyId}/logo-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`;
const candidateC = `${companyId}/logo-cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp`;
const candidateD = `${companyId}/logo-dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp`;
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
      else reject(new Error(stderr.trim() || "Concurrent logo command failed."));
    });
  });
}

function startMarkedSql(sql, marker) {
  const child = spawn(
    "docker",
    ["exec", "-i", databaseContainer, "psql", ...psqlArgs, "-c", sql],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  let markerSeen = false;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const completion = new Promise((resolve, reject) => {
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!markerSeen && stdout.includes(marker)) {
        markerSeen = true;
        resolveReady();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (!markerSeen) rejectReady(error);
      reject(error);
    });
    child.on("close", (status) => {
      if (status === 0) {
        if (!markerSeen) {
          const error = new Error(`Concurrent command never emitted ${marker}.`);
          rejectReady(error);
          reject(error);
          return;
        }
        resolve(stdout.trim());
        return;
      }
      const error = new Error(stderr.trim() || "Concurrent logo transaction failed.");
      if (!markerSeen) rejectReady(error);
      reject(error);
    });
  });
  return { ready, completion };
}

const authenticatedSql = `
  set local role authenticated;
  set local "request.jwt.claim.sub" = '${adminId}';
  set local "request.jwt.claim.role" = 'authenticated';
  set local storage.allow_delete_query = 'true';
`;

function reserveLogo(path) {
  return runSql(`
    begin;
    ${authenticatedSql}
    select public.reserve_company_logo_upload('${companyId}', '${path}');
    commit;
  `);
}

function uploadLogoSql(path, marker = null) {
  return `
    begin;
    ${authenticatedSql}
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'company-logos',
      '${path}',
      auth.uid()::text,
      '{"mimetype":"image/webp"}'::jsonb
    );
    ${marker ? `select '${marker}'; select pg_sleep(1.25);` : ""}
    commit;
  `;
}

const cleanupSql = `
  begin;
  select set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects
  where bucket_id = 'company-logos'
    and name like '${companyId}/%';
  delete from public.companies where id = '${companyId}';
  delete from auth.users where id = '${adminId}';
  commit;
`;

try {
  runSql(`
    ${cleanupSql}
    begin;
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '${adminId}',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'logo-race-admin@example.test',
      extensions.crypt('local-test-only', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Logo Race Admin"}', now(), now(), '', '', '', ''
    );
    update public.profiles set role = 'company_admin' where id = '${adminId}';
    insert into public.companies (id, name, abn, status)
    values ('${companyId}', 'Logo Race Company', '55555555555', 'approved');
    insert into public.company_members (company_id, profile_id)
    values ('${companyId}', '${adminId}');
    commit;
  `);

  if (reserveLogo(candidateA) !== candidateA) {
    throw new Error("Initial logo candidate was not reserved.");
  }
  runSql(uploadLogoSql(candidateA));
  if (reserveLogo(candidateB) !== candidateA) {
    throw new Error("Replacement reservation did not return the stale candidate.");
  }
  const staleDeleteCount = runSql(`
    begin;
    ${authenticatedSql}
    with deleted as (
      delete from storage.objects
      where bucket_id = 'company-logos' and name = '${candidateA}'
      returning 1
    )
    select count(*)::integer from deleted;
    commit;
  `);
  if (staleDeleteCount !== "1") {
    throw new Error("Invalidated stale candidate could not be cleaned up.");
  }
  runSql(uploadLogoSql(candidateB));

  const identity = startMarkedSql(`
    begin;
    ${authenticatedSql}
    select public.update_company_identity(
      '${companyId}',
      'Logo Race Company',
      '55555555555',
      '${candidateB}'
    );
    select 'IDENTITY_UPDATED';
    select pg_sleep(1.25);
    commit;
  `, "IDENTITY_UPDATED");
  await identity.ready;
  const reservedDeleteCount = runSql(`
    begin;
    ${authenticatedSql}
    with deleted as (
      delete from storage.objects
      where bucket_id = 'company-logos' and name = '${candidateB}'
      returning 1
    )
    select count(*)::integer from deleted;
    commit;
  `);
  if (reservedDeleteCount !== "0") {
    throw new Error("An identity commit allowed its reserved logo to be deleted.");
  }
  await identity.completion;

  const pointerSummary = runSql(`
    select
      company.logo_path,
      exists (
        select 1 from storage.objects object
        where object.bucket_id = 'company-logos'
          and object.name = company.logo_path
      ),
      (select count(*) from storage.objects object
       where object.bucket_id = 'company-logos'
         and object.name like '${companyId}/%')
    from public.companies company
    where company.id = '${companyId}';
  `);
  if (pointerSummary !== `${candidateB}|t|1`) {
    throw new Error(`Committed logo pointer invariant failed: ${pointerSummary || "no row"}`);
  }

  if (reserveLogo(candidateC) !== candidateC) {
    throw new Error("Parallel-upload candidate was not reserved.");
  }
  const candidateUpload = startMarkedSql(
    uploadLogoSql(candidateC, "CANDIDATE_INSERTED"),
    "CANDIDATE_INSERTED",
  );
  await candidateUpload.ready;
  const competingReservation = runSqlConcurrently(`
    begin;
    ${authenticatedSql}
    select public.reserve_company_logo_upload('${companyId}', '${candidateD}');
    commit;
  `);
  const competingResult = await competingReservation;
  if (competingResult === candidateD) {
    runSql(uploadLogoSql(candidateD));
  }
  await candidateUpload.completion;

  const objectCount = Number(runSql(`
    select count(*)
    from storage.objects
    where bucket_id = 'company-logos'
      and name like '${companyId}/%';
  `));
  if (competingResult !== candidateC || objectCount > 2) {
    throw new Error(
      `Parallel logo quota invariant failed: reservation=${competingResult}, objects=${objectCount}`,
    );
  }

  console.log(
    "Logo concurrency check passed: pointer remained backed and parallel uploads stayed bounded.",
  );
} finally {
  runSql(cleanupSql);
}
