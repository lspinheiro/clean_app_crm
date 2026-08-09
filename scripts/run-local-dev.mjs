import { spawnSync as nodeSpawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");

function parseEnvironment(output) {
  return Object.fromEntries(
    String(output ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator === -1) return [line, ""];

        const name = line.slice(0, separator);
        const rawValue = line.slice(separator + 1);
        const value =
          rawValue.startsWith('"') && rawValue.endsWith('"')
            ? rawValue.slice(1, -1)
            : rawValue;
        return [name, value];
      }),
  );
}

function exitCode(result) {
  if (typeof result.status === "number") return result.status;
  return result.signal === "SIGINT" ? 130 : 1;
}

export function runLocalDev({
  spawnSync = nodeSpawnSync,
  environment = process.env,
  nextArguments = [],
  write = (message) => process.stderr.write(message),
} = {}) {
  const run = (args, options = {}) =>
    spawnSync("pnpm", args, {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
      ...options,
    });

  write("[crm:dev] Starting or reusing the local Supabase stack...\n");
  const startResult = run(["--dir", "packages/db", "db:start"]);
  if (exitCode(startResult) !== 0) {
    write("[crm:dev] Supabase did not start; CRM was not launched.\n");
    return exitCode(startResult);
  }

  write("[crm:dev] Applying pending local database migrations...\n");
  const migrationResult = run([
    "--dir",
    "packages/db",
    "exec",
    "supabase",
    "--workdir",
    ".",
    "migration",
    "up",
    "--local",
  ]);
  if (exitCode(migrationResult) !== 0) {
    write("[crm:dev] Database migrations failed; CRM was not launched.\n");
    return exitCode(migrationResult);
  }

  const statusResult = run(
    [
      "--dir",
      "packages/db",
      "exec",
      "supabase",
      "--workdir",
      ".",
      "status",
      "-o",
      "env",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (exitCode(statusResult) !== 0) {
    write("[crm:dev] Could not read local Supabase credentials; CRM was not launched.\n");
    return exitCode(statusResult);
  }

  const localEnvironment = parseEnvironment(statusResult.stdout);
  const supabaseUrl = localEnvironment.API_URL;
  const publishableKey =
    localEnvironment.PUBLISHABLE_KEY ?? localEnvironment.ANON_KEY;

  if (!supabaseUrl || !publishableKey) {
    write("[crm:dev] Local Supabase URL or publishable key is missing; CRM was not launched.\n");
    return 1;
  }

  write("[crm:dev] Starting CRM...\n");
  const crmResult = run(
    ["--filter", "crm", "exec", "next", "dev", ...nextArguments],
    {
      env: {
        ...environment,
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
        NEXT_PUBLIC_CLEANER_APP_URL:
          environment.NEXT_PUBLIC_CLEANER_APP_URL ?? "http://127.0.0.1:3001",
      },
    },
  );

  return exitCode(crmResult);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  process.exitCode = runLocalDev({ nextArguments: process.argv.slice(2) });
}
