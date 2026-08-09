import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbRoot = path.join(repoRoot, "packages/db");

const statusOutput = execFileSync(
  "pnpm",
  ["--dir", dbRoot, "exec", "supabase", "--workdir", ".", "status", "-o", "env"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
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

const forwardedArguments = process.argv.slice(2);
if (forwardedArguments[0] === "--") forwardedArguments.shift();

const result = spawnSync(
  "pnpm",
  ["--filter", "crm", "exec", "playwright", "test", ...forwardedArguments],
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
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
