import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function run(command, args) {
  // On Windows `supabase` is a `.cmd` launcher, which spawnSync cannot resolve without a
  // shell. `process.execPath` is a real executable and needs no shell either way.
  const shell = process.platform === "win32" && command !== process.execPath;
  const result = spawnSync(command, args, { stdio: "inherit", shell });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("supabase", ["--workdir", ".", "test", "db"]);
run(process.execPath, [
  fileURLToPath(new URL("./test-invite-concurrency.mjs", import.meta.url)),
]);
run(process.execPath, [
  fileURLToPath(new URL("./test-logo-concurrency.mjs", import.meta.url)),
]);
run(process.execPath, [
  fileURLToPath(new URL("./test-job-assignment-concurrency.mjs", import.meta.url)),
]);
run(process.execPath, [
  fileURLToPath(new URL("./test-loop-concurrency.mjs", import.meta.url)),
]);
run(process.execPath, [
  fileURLToPath(new URL("./test-recurring-assignment-concurrency.mjs", import.meta.url)),
]);
run(process.execPath, [
  fileURLToPath(new URL("./test-generation-concurrency.mjs", import.meta.url)),
]);
