import assert from "node:assert/strict";
import test from "node:test";

import { runLocalDev } from "./run-local-dev.mjs";

const successfulStatus = [
  'API_URL="http://127.0.0.1:55321"',
  'PUBLISHABLE_KEY="local-publishable-key"',
].join("\n");

test("starts Supabase, applies migrations, and launches CRM with local credentials", () => {
  const calls = [];
  const spawnSync = (command, args, options) => {
    calls.push({ command, args, options });

    if (args.includes("status")) {
      return { status: 0, stdout: successfulStatus };
    }

    return { status: 0 };
  };

  const exitCode = runLocalDev({
    spawnSync,
    environment: { PATH: "/test/bin" },
    write() {},
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map(({ args }) => args),
    [
      ["--dir", "packages/db", "db:start"],
      [
        "--dir",
        "packages/db",
        "exec",
        "supabase",
        "--workdir",
        ".",
        "migration",
        "up",
        "--local",
      ],
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
      ["--filter", "crm", "exec", "next", "dev"],
    ],
  );
  assert.equal(
    calls.at(-1).options.env.NEXT_PUBLIC_SUPABASE_URL,
    "http://127.0.0.1:55321",
  );
  assert.equal(
    calls.at(-1).options.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "local-publishable-key",
  );
  assert.equal(
    calls.at(-1).options.env.NEXT_PUBLIC_CLEANER_APP_URL,
    "http://127.0.0.1:3001",
  );
});

test("does not launch CRM when Supabase fails to start", () => {
  const calls = [];
  const exitCode = runLocalDev({
    spawnSync(command, args) {
      calls.push({ command, args });
      return { status: 1 };
    },
    write() {},
  });

  assert.equal(exitCode, 1);
  assert.equal(calls.length, 1);
});

test("does not launch CRM when the local credentials are unavailable", () => {
  const calls = [];
  const exitCode = runLocalDev({
    spawnSync(command, args) {
      calls.push({ command, args });
      return args.includes("status")
        ? { status: 0, stdout: 'API_URL="http://127.0.0.1:55321"' }
        : { status: 0 };
    },
    write() {},
  });

  assert.equal(exitCode, 1);
  assert.equal(calls.length, 3);
});
