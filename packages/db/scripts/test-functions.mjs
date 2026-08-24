import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Edge Functions are Deno, not Node, so they sit outside the workspace's vitest runs. Each
// function carries its own `deno.json`, and `nodeModulesDir: "auto"` resolves the npm type
// references relative to the working directory — so every function is tested from inside its
// own directory rather than by pointing Deno at the tree.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionsRoot = path.join(packageRoot, "supabase/functions");
// On Windows `deno` is a `.cmd`/`.exe` launcher, which spawnSync cannot resolve without a shell.
const shell = process.platform === "win32";

function functionDirectories() {
  let entries;
  try {
    entries = readdirSync(functionsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(functionsRoot, entry.name))
    .filter((directory) => {
      try {
        return readdirSync(directory).includes("deno.json");
      } catch {
        return false;
      }
    })
    .sort();
}

const directories = functionDirectories();
if (!directories.length) {
  console.log("No Edge Functions to test.");
  process.exit(0);
}

const version = spawnSync("deno", ["--version"], { encoding: "utf8", shell });
if (version.error || version.status !== 0) {
  console.error(
    "Deno is required to test Edge Functions. Install it (https://docs.deno.com/runtime/getting_started/installation/)\n" +
      "or, on macOS, `brew install deno`.",
  );
  process.exit(1);
}

for (const directory of directories) {
  const name = path.basename(directory);
  console.log(`Testing Edge Function ${name}...`);
  const result = spawnSync("deno", ["test"], { cwd: directory, stdio: "inherit", shell });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
