import { spawnSync } from "node:child_process";

const projectId = "clean_app_crm";
const apiUrl = "http://127.0.0.1:55321";
const authReadinessTimeoutMs = 60_000;
const authPollIntervalMs = 1_000;
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

const authHealthUrl = `${apiUrl}/auth/v1/health`;
const readinessStartedAt = Date.now();
const readinessDeadline = readinessStartedAt + authReadinessTimeoutMs;
let healthy = false;
while (Date.now() < readinessDeadline) {
  const remainingMs = Math.max(1, readinessDeadline - Date.now());
  const response = await fetch(authHealthUrl, {
    signal: AbortSignal.timeout(remainingMs),
  }).catch(() => null);
  if (response?.ok) {
    healthy = true;
    break;
  }

  const delayMs = Math.min(authPollIntervalMs, readinessDeadline - Date.now());
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

if (!healthy) {
  const waitedSeconds = ((Date.now() - readinessStartedAt) / 1_000).toFixed(1);
  throw new Error(
    `Local Supabase Auth at ${authHealthUrl} did not become healthy after waiting ${waitedSeconds} seconds following the gateway restart.`,
  );
}
console.log("Local database reset complete; Auth is healthy.");
