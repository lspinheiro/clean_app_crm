import { spawnSync as nodeSpawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const localSupabaseDirectory = path.join(repositoryRoot, "packages/db/supabase");
const localSupabaseConfigPaths = [
  path.join(localSupabaseDirectory, "config.toml"),
  path.join(localSupabaseDirectory, "templates/invite.html"),
  path.join(localSupabaseDirectory, "templates/recovery.html"),
];
const appliedConfigFingerprintPath = path.join(
  localSupabaseDirectory,
  ".temp/applied-local-config.sha256",
);

function defaultLocalSupabaseConfig() {
  const fingerprint = createHash("sha256");
  for (const configPath of localSupabaseConfigPaths) {
    fingerprint.update(path.relative(localSupabaseDirectory, configPath));
    fingerprint.update("\0");
    fingerprint.update(readFileSync(configPath));
    fingerprint.update("\0");
  }

  return {
    currentFingerprint: fingerprint.digest("hex"),
    readAppliedFingerprint() {
      try {
        return readFileSync(appliedConfigFingerprintPath, "utf8").trim();
      } catch {
        return null;
      }
    },
    writeAppliedFingerprint(value) {
      mkdirSync(path.dirname(appliedConfigFingerprintPath), { recursive: true });
      writeFileSync(appliedConfigFingerprintPath, `${value}\n`, "utf8");
    },
  };
}

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

const defaultApp = "crm";

function exitCode(result) {
  if (typeof result.status === "number") return result.status;
  return result.signal === "SIGINT" ? 130 : 1;
}

export function parseArguments(argv = []) {
  const nextArguments = [];
  let app = defaultApp;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--app") {
      app = argv[index + 1] ?? app;
      index += 1;
      continue;
    }

    if (value.startsWith("--app=")) {
      app = value.slice("--app=".length);
      continue;
    }

    nextArguments.push(value);
  }

  return { app, nextArguments };
}

export function runLocalDev({
  spawnSync = nodeSpawnSync,
  environment = process.env,
  nextArguments = [],
  app = defaultApp,
  localSupabaseConfig = defaultLocalSupabaseConfig(),
  platform = process.platform,
  write = (message) => process.stderr.write(message),
} = {}) {
  const prefix = `[${app}:dev]`;
  // On Windows pnpm is a `.cmd` launcher, which spawnSync cannot execute without a shell:
  // it fails with ENOENT, leaves `status` null, and every step looks like a Supabase failure.
  const shell = platform === "win32";

  const run = (args, options = {}) => {
    const result = spawnSync("pnpm", args, {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
      shell,
      ...options,
    });

    if (result.error) {
      write(`${prefix} Could not run pnpm: ${result.error.message}\n`);
    }

    return result;
  };

  const localConfigChanged =
    localSupabaseConfig.readAppliedFingerprint()
    !== localSupabaseConfig.currentFingerprint;

  if (localConfigChanged) {
    write(`${prefix} Local Supabase configuration changed; refreshing the stack...\n`);
    const runningStatus = run(
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
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );

    if (exitCode(runningStatus) === 0) {
      const stopResult = run(["--dir", "packages/db", "db:stop"]);
      if (exitCode(stopResult) !== 0) {
        write(`${prefix} Supabase could not restart; ${app} was not launched.\n`);
        return exitCode(stopResult);
      }
    }
  }

  write(`${prefix} Starting or reusing the local Supabase stack...\n`);
  const startResult = run(["--dir", "packages/db", "db:start"]);
  if (exitCode(startResult) !== 0) {
    write(`${prefix} Supabase did not start; ${app} was not launched.\n`);
    return exitCode(startResult);
  }

  if (localConfigChanged) {
    try {
      localSupabaseConfig.writeAppliedFingerprint(
        localSupabaseConfig.currentFingerprint,
      );
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      write(
        `${prefix} Could not remember the applied local Supabase configuration${detail}\n`,
      );
    }
  }

  write(`${prefix} Applying pending local database migrations...\n`);
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
    write(`${prefix} Database migrations failed; ${app} was not launched.\n`);
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
    write(
      `${prefix} Could not read local Supabase credentials; ${app} was not launched.\n`,
    );
    return exitCode(statusResult);
  }

  const localEnvironment = parseEnvironment(statusResult.stdout);
  const supabaseUrl = localEnvironment.API_URL;
  const publishableKey =
    localEnvironment.PUBLISHABLE_KEY ?? localEnvironment.ANON_KEY;

  if (!supabaseUrl || !publishableKey) {
    write(
      `${prefix} Local Supabase URL or publishable key is missing; ${app} was not launched.\n`,
    );
    return 1;
  }

  write(`${prefix} Starting ${app}...\n`);
  const appResult = run(
    ["--filter", app, "exec", "next", "dev", ...nextArguments],
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

  return exitCode(appResult);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  process.exitCode = runLocalDev(parseArguments(process.argv.slice(2)));
}
