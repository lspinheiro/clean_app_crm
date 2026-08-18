import assert from "node:assert/strict";
import test from "node:test";

import { runLocalDev } from "./run-local-dev.mjs";

const successfulStatus = [
  'API_URL="http://127.0.0.1:55321"',
  'PUBLISHABLE_KEY="local-publishable-key"',
].join("\n");

const matchedLocalSupabaseConfig = {
  currentFingerprint: "current-config",
  readAppliedFingerprint: () => "current-config",
  writeAppliedFingerprint() {},
};

function recordingSpawnSync(calls) {
  return (command, args, options) => {
    calls.push({ command, args, options });

    if (args.includes("status")) {
      return { status: 0, stdout: successfulStatus };
    }

    return { status: 0 };
  };
}

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
    localSupabaseConfig: matchedLocalSupabaseConfig,
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

test("launches the requested workspace app with its own next arguments", () => {
  const calls = [];

  const exitCode = runLocalDev({
    spawnSync: recordingSpawnSync(calls),
    environment: { PATH: "/test/bin" },
    app: "cleaner",
    localSupabaseConfig: matchedLocalSupabaseConfig,
    nextArguments: ["--port", "3001"],
    write() {},
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.at(-1).args, [
    "--filter",
    "cleaner",
    "exec",
    "next",
    "dev",
    "--port",
    "3001",
  ]);
});

test("reads the target app from --app and forwards the rest to next", async () => {
  const { parseArguments } = await import("./run-local-dev.mjs");

  assert.equal(typeof parseArguments, "function");
  assert.deepEqual(parseArguments([]), { app: "crm", nextArguments: [] });
  assert.deepEqual(parseArguments(["--app", "cleaner", "--port", "3001"]), {
    app: "cleaner",
    nextArguments: ["--port", "3001"],
  });
  assert.deepEqual(parseArguments(["--app=cleaner"]), {
    app: "cleaner",
    nextArguments: [],
  });
});

test("spawns through a shell on Windows so the pnpm launcher resolves", () => {
  const calls = [];

  runLocalDev({
    spawnSync: recordingSpawnSync(calls),
    environment: { PATH: "/test/bin" },
    localSupabaseConfig: matchedLocalSupabaseConfig,
    platform: "win32",
    write() {},
  });

  assert.ok(calls.length > 0);
  assert.ok(calls.every(({ options }) => options.shell === true));
});

test("does not spawn through a shell on POSIX platforms", () => {
  const calls = [];

  runLocalDev({
    spawnSync: recordingSpawnSync(calls),
    environment: { PATH: "/test/bin" },
    localSupabaseConfig: matchedLocalSupabaseConfig,
    platform: "linux",
    write() {},
  });

  assert.ok(calls.length > 0);
  assert.ok(calls.every(({ options }) => options.shell !== true));
});

test("reports the underlying spawn failure instead of a generic message", () => {
  const messages = [];

  const exitCode = runLocalDev({
    spawnSync: () => ({
      status: null,
      error: new Error("spawnSync pnpm ENOENT"),
    }),
    environment: { PATH: "/test/bin" },
    localSupabaseConfig: matchedLocalSupabaseConfig,
    write: (message) => messages.push(message),
  });

  assert.equal(exitCode, 1);
  assert.match(messages.join(""), /spawnSync pnpm ENOENT/);
});

test("does not launch CRM when Supabase fails to start", () => {
  const calls = [];
  const exitCode = runLocalDev({
    spawnSync(command, args) {
      calls.push({ command, args });
      return { status: 1 };
    },
    localSupabaseConfig: matchedLocalSupabaseConfig,
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
    localSupabaseConfig: matchedLocalSupabaseConfig,
    write() {},
  });

  assert.equal(exitCode, 1);
  assert.equal(calls.length, 3);
});

test("restarts a running Supabase stack when committed local configuration changed", () => {
  const calls = [];
  const appliedFingerprints = [];

  const exitCode = runLocalDev({
    spawnSync: recordingSpawnSync(calls),
    environment: { PATH: "/test/bin" },
    localSupabaseConfig: {
      currentFingerprint: "new-config",
      readAppliedFingerprint: () => "old-config",
      writeAppliedFingerprint: (fingerprint) => appliedFingerprints.push(fingerprint),
    },
    write() {},
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map(({ args }) => args),
    [
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
      ["--dir", "packages/db", "db:stop"],
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
  assert.deepEqual(appliedFingerprints, ["new-config"]);
});

test("applies changed local configuration without stopping when Supabase is not running", () => {
  const calls = [];
  const appliedFingerprints = [];
  let statusCalls = 0;

  const exitCode = runLocalDev({
    spawnSync(command, args, options) {
      calls.push({ command, args, options });
      if (args.includes("status")) {
        statusCalls += 1;
        if (statusCalls === 1) return { status: 1 };
        return { status: 0, stdout: successfulStatus };
      }
      return { status: 0 };
    },
    environment: { PATH: "/test/bin" },
    localSupabaseConfig: {
      currentFingerprint: "new-config",
      readAppliedFingerprint: () => null,
      writeAppliedFingerprint: (fingerprint) => appliedFingerprints.push(fingerprint),
    },
    write() {},
  });

  assert.equal(exitCode, 0);
  assert.equal(
    calls.some(({ args }) => args.includes("db:stop")),
    false,
  );
  assert.deepEqual(appliedFingerprints, ["new-config"]);
});

test("does not launch the app or record configuration when a required restart fails", () => {
  const calls = [];
  const appliedFingerprints = [];

  const exitCode = runLocalDev({
    spawnSync(command, args, options) {
      calls.push({ command, args, options });
      if (args.includes("status")) return { status: 0, stdout: successfulStatus };
      if (args.includes("db:stop")) return { status: 1 };
      return { status: 0 };
    },
    environment: { PATH: "/test/bin" },
    localSupabaseConfig: {
      currentFingerprint: "new-config",
      readAppliedFingerprint: () => "old-config",
      writeAppliedFingerprint: (fingerprint) => appliedFingerprints.push(fingerprint),
    },
    write() {},
  });

  assert.equal(exitCode, 1);
  assert.equal(
    calls.some(({ args }) => args.includes("db:start")),
    false,
  );
  assert.deepEqual(appliedFingerprints, []);
});
