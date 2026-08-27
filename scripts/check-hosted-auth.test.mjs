import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExpectations,
  checkHostedAuth,
  findAuthDrift,
} from "./check-hosted-auth.mjs";

// Hosted auth used to drift silently from the repository: `otp_expiry` said seven days in
// config.toml from 2026-08-20 while the project ran the 3600-second default, so every
// employee invitation died an hour after an e-mail promising it seven days. Nothing in the
// release noticed. These tests pin the comparison, not the network.

const productionConfirmUrls = [
  "https://crm.thecleancrew.app/en-AU/auth/confirm",
  "https://crm.thecleancrew.app/pt-BR/auth/confirm",
  "https://cleaner.thecleancrew.app/en-AU/auth/confirm",
  "https://cleaner.thecleancrew.app/pt-BR/auth/confirm",
];


/** A config.toml slice with the sections the expectations are derived from. */
function configToml({ otpExpiry = 604800, invite = "i", recovery = "r" } = {}) {
  return [
    "[auth]",
    'site_url = "http://127.0.0.1:3000"',
    "enable_signup = true",
    "",
    "[auth.email]",
    `otp_expiry = ${otpExpiry}`,
    "",
    "[auth.email.template.invite]",
    `subject = "${invite}"`,
    "",
    "[auth.email.template.recovery]",
    `subject = "${recovery}"`,
  ].join("\n");
}

function healthyConfig(overrides = {}) {
  return {
    mailer_otp_exp: 604800,
    mailer_autoconfirm: false,
    disable_signup: false,
    site_url: "https://cleaner.thecleancrew.app",
    uri_allow_list: [
      "https://crm.thecleancrew.app",
      "https://cleaner.thecleancrew.app",
      ...productionConfirmUrls,
    ].join(","),
    mailer_subjects_invite: "invite subject from config.toml",
    mailer_subjects_recovery: "recovery subject from config.toml",
    ...overrides,
  };
}

const expectations = [
  { key: "mailer_otp_exp", expected: 604800, why: "the e-mail promises seven days" },
  { key: "mailer_autoconfirm", expected: false, why: "an invitee must confirm" },
  { key: "disable_signup", expected: false, why: "CL-1 registers cleaners" },
  { key: "site_url", expected: "https://cleaner.thecleancrew.app", why: "production origin" },
  {
    key: "uri_allow_list",
    match: "contains",
    expected: productionConfirmUrls,
    why: "auth e-mail links land on these",
  },
  {
    key: "mailer_subjects_invite",
    expected: "invite subject from config.toml",
    why: "one language per locale",
  },
  {
    key: "mailer_subjects_recovery",
    expected: "recovery subject from config.toml",
    why: "one language per locale",
  },
];

test("a hosted project matching the repository reports no drift", () => {
  assert.deepEqual(findAuthDrift(expectations, healthyConfig()), []);
});

test("the one-hour expiry that broke employee invitations is caught", () => {
  const drift = findAuthDrift(expectations, healthyConfig({ mailer_otp_exp: 3600 }));

  assert.equal(drift.length, 1);
  assert.equal(drift[0].key, "mailer_otp_exp");
  assert.equal(drift[0].expected, 604800);
  assert.equal(drift[0].actual, 3600);
  assert.match(drift[0].why, /seven days/);
});

test("a site_url pointing at a developer machine is caught", () => {
  const drift = findAuthDrift(
    expectations,
    healthyConfig({ site_url: "http://127.0.0.1:3000" }),
  );

  assert.deepEqual(drift.map((entry) => entry.key), ["site_url"]);
});

test("an allow-list stripped back to localhost is caught", () => {
  const drift = findAuthDrift(
    expectations,
    healthyConfig({ uri_allow_list: "http://localhost:3000,http://127.0.0.1:3000" }),
  );

  assert.equal(drift.length, 1);
  assert.equal(drift[0].key, "uri_allow_list");
  // Naming what is absent is the difference between a usable failure and a puzzle.
  assert.match(drift[0].actual, /missing/i);
  for (const url of productionConfirmUrls) assert.match(drift[0].actual, new RegExp(url));
});

test("an allow-list carrying extra development origins still passes", () => {
  // Adding a preview origin must not fail a release; only losing a production one may.
  const generous = healthyConfig({
    uri_allow_list: `${healthyConfig().uri_allow_list},http://localhost:3000,http://localhost:3001`,
  });

  assert.deepEqual(findAuthDrift(expectations, generous), []);
});

test("auto-confirm turning itself on is caught", () => {
  // `supabase config push` flipped this to true on 2026-08-27, which confirms an e-mail
  // address nobody proved they own.
  const drift = findAuthDrift(expectations, healthyConfig({ mailer_autoconfirm: true }));

  assert.deepEqual(drift.map((entry) => entry.key), ["mailer_autoconfirm"]);
});

test("every drifted setting is reported, not just the first", () => {
  const drift = findAuthDrift(
    expectations,
    healthyConfig({ mailer_otp_exp: 3600, mailer_autoconfirm: true, site_url: "http://x" }),
  );

  assert.deepEqual(
    drift.map((entry) => entry.key).sort(),
    ["mailer_autoconfirm", "mailer_otp_exp", "site_url"],
  );
});

test("a setting the hosted project does not return at all is drift, not a pass", () => {
  const config = healthyConfig();
  delete config.mailer_otp_exp;

  const drift = findAuthDrift(expectations, config);

  assert.deepEqual(drift.map((entry) => entry.key), ["mailer_otp_exp"]);
});

test("expectations take the values config.toml already states", () => {
  // config.toml stays authoritative wherever it can be. A second copy of `otp_expiry` in
  // this script would be one more thing to drift.
  const built = buildExpectations({
    configToml: [
      "[auth]",
      'site_url = "http://127.0.0.1:3000"',
      "enable_signup = true",
      "",
      "[auth.email]",
      "otp_expiry = 604800",
      "",
      "[auth.email.template.invite]",
      'subject = "branching invite subject"',
      "",
      "[auth.email.template.recovery]",
      'subject = "branching recovery subject"',
    ].join("\n"),
  });

  const byKey = Object.fromEntries(built.map((entry) => [entry.key, entry.expected]));
  assert.equal(byKey.mailer_otp_exp, 604800);
  assert.equal(byKey.mailer_subjects_invite, "branching invite subject");
  assert.equal(byKey.mailer_subjects_recovery, "branching recovery subject");
  assert.equal(byKey.disable_signup, false);
  // Not derivable: config.toml describes a developer machine.
  assert.equal(byKey.site_url, "https://cleaner.thecleancrew.app");
});

test("the check passes cleanly and never writes", async () => {
  const requests = [];
  const logged = [];
  const result = await checkHostedAuth({
    accessToken: "token",
    projectRef: "ref",
    configToml: configToml(),
    fetchImpl: async (url, options) => {
      requests.push({ url, method: options?.method ?? "GET" });
      return {
        ok: true,
        json: async () => healthyConfig({
          mailer_subjects_invite: "i",
          mailer_subjects_recovery: "r",
        }),
      };
    },
    log: (line) => logged.push(line),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.drift, []);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET", "the check must never write to the project");
  assert.match(requests[0].url, /\/projects\/ref\/config\/auth$/);
});

test("the check fails and names every drift when the project has moved", async () => {
  const logged = [];
  const result = await checkHostedAuth({
    accessToken: "token",
    projectRef: "ref",
    configToml: configToml(),
    fetchImpl: async () => ({
      ok: true,
      json: async () => healthyConfig({
        mailer_otp_exp: 3600,
        mailer_subjects_invite: "i",
        mailer_subjects_recovery: "r",
      }),
    }),
    log: (line) => logged.push(line),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.drift.map((entry) => entry.key), ["mailer_otp_exp"]);
  assert.match(logged.join("\n"), /mailer_otp_exp/);
  assert.match(logged.join("\n"), /3600/);
});

test("an API failure fails the check rather than reporting a healthy project", async () => {
  const result = await checkHostedAuth({
    accessToken: "token",
    projectRef: "ref",
    configToml: configToml(),
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => "Unauthorized" }),
    log: () => {},
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /401/);
});

test("a config.toml that lost the setting fails the check instead of skipping it", async () => {
  // Deleting `otp_expiry` must break the release loudly. Silently dropping the expectation
  // would restore exactly the blindness this script exists to end.
  const withoutExpiry = configToml().replace("otp_expiry = 604800", "");

  const result = await checkHostedAuth({
    accessToken: "token",
    projectRef: "ref",
    configToml: withoutExpiry,
    fetchImpl: async () => ({ ok: true, json: async () => healthyConfig() }),
    log: () => {},
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /otp_expiry/);
});

test("buildExpectations refuses a config.toml missing a derived subject", () => {
  const withoutSubject = configToml().replace('subject = "r"', "");

  assert.throws(
    () => buildExpectations({ configToml: withoutSubject }),
    /auth\.email\.template\.recovery/,
  );
});
