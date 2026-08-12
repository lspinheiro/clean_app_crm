import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArguments } from "./run-local-dev.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbRoot = path.join(repoRoot, "packages/db");
// On Windows pnpm is a `.cmd` launcher, which the child_process helpers cannot execute
// without a shell.
const shell = process.platform === "win32";

const { app, nextArguments } = parseArguments(process.argv.slice(2));

const statusOutput = execFileSync(
  "pnpm",
  ["--dir", dbRoot, "exec", "supabase", "--workdir", ".", "status", "-o", "env"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell },
);

const localEnvironment = Object.fromEntries(
  statusOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, "")];
    }),
);

const url = localEnvironment.API_URL;
const publishableKey = localEnvironment.PUBLISHABLE_KEY ?? localEnvironment.ANON_KEY;
if (!url || !publishableKey) {
  throw new Error(
    `Local Supabase status is missing API_URL or a client key. Available fields: ${Object.keys(localEnvironment).join(", ")}`,
  );
}

console.log(`Using local Supabase at ${url}.`);

// Acceptance specs assert against the documented seed, and they leave records behind: the
// cleaner suite registers a real cleaner into the demo pool, the CRM suite creates clients
// and rotates the invite. Reset first so every suite starts from the same fixture, whether
// it runs alone or as part of the workspace sweep.
console.log("Resetting the local database to the seeded fixture...");
const resetResult = spawnSync("pnpm", ["--dir", dbRoot, "db:reset"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell,
});
if (resetResult.error) throw resetResult.error;
if (resetResult.status !== 0) process.exit(resetResult.status ?? 1);

const forwardedArguments = [...nextArguments];
if (forwardedArguments[0] === "--") forwardedArguments.shift();

const result = spawnSync(
  "pnpm",
  ["--filter", app, "exec", "playwright", "test", ...forwardedArguments],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      NEXT_PUBLIC_CLEANER_APP_URL:
        process.env.NEXT_PUBLIC_CLEANER_APP_URL ?? "http://127.0.0.1:3001",
    },
    stdio: "inherit",
    shell,
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
