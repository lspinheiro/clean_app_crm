import { spawnSync } from "node:child_process";

const projectId = "clean_app_crm";
const apiUrl = "http://127.0.0.1:55321";
// On Windows these are `.cmd`/`.exe` launchers, which spawnSync cannot resolve without a
// shell; without this it fails with ENOENT before the reset ever runs.
const shell = process.platform === "win32";

const reset = spawnSync("supabase", ["--workdir", ".", "db", "reset"], {
  stdio: "inherit",
  shell,
});
if (reset.error) throw reset.error;
if (reset.status !== 0) process.exit(reset.status ?? 1);

// CLI 2.106 reuses the gateway while recreating Auth during reset. Restarting only this
// project's gateway clears its stale upstream DNS entry without touching another stack.
const gateway = spawnSync("docker", ["restart", `supabase_kong_${projectId}`], {
  encoding: "utf8",
  shell,
});
if (gateway.error) throw gateway.error;
if (gateway.status !== 0) {
  throw new Error(`Could not restart the local Supabase gateway: ${gateway.stderr.trim()}`);
}

let healthy = false;
for (let attempt = 0; attempt < 20; attempt += 1) {
  const response = await fetch(`${apiUrl}/auth/v1/health`).catch(() => null);
  if (response?.ok) {
    healthy = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

if (!healthy) throw new Error("Local Supabase Auth did not become healthy after reset.");
console.log("Local database reset complete; Auth is healthy.");
