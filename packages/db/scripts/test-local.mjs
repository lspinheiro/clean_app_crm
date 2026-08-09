import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("supabase", ["--workdir", ".", "test", "db"]);
run(process.execPath, [
  fileURLToPath(new URL("./test-invite-concurrency.mjs", import.meta.url)),
]);
