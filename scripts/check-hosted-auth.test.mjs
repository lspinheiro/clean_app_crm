import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExpectations,
  checkHostedAuth,
  findAuthDrift,
  matchesRedirectPattern,
  requiredRedirectUrls,
} from "./check-hosted-auth.mjs";

// Hosted auth used to drift silently from the repository: `otp_expiry` said seven days in
// config.toml from 2026-08-20 while the project ran the 3600-second default, so every
// employee invitation died an hour after an e-mail promising it seven days. Nothing in the
// release noticed. These tests pin the comparison, not the network.

const productionConfirmUrls = requiredRedirectUrls();


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
      "https://crm.thecleancrew.app/**",
      "https://cleaner.thecleancrew.app/**",
    ].join(","),
    rate_limit_email_sent: 30,
    mailer_subjects_invite: "invite subject from config.toml",
    mailer_subjects_recovery: "recovery subject from config.toml",
    ...overrides,
  };
}

const expectations = [
  { key: "mailer_otp_exp", expected: 604800, why: "the e-mail promises seven days" },
  {
    key: "rate_limit_email_sent",
    match: "atLeast",
    expected: 10,
    why: "custom SMTP is configured; the built-in default starves invitations",
  },
  { key: "mailer_autoconfirm", expected: false, why: "an invitee must confirm" },
  { key: "disable_signup", expected: false, why: "CL-1 registers cleaners" },
  { key: "site_url", expected: "https://cleaner.thecleancrew.app", why: "production origin" },
  {
    key: "uri_allow_list",
    match: "permits",
    expected: productionConfirmUrls,
    why: "a refused redirect is replaced by site_url",
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
  // Naming what was refused is the difference between a usable failure and a puzzle.
  assert.match(drift[0].actual, /refuses/i);
  assert.match(drift[0].actual, /auth\/confirm/);
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

// An employee invitation on 2026-08-27 rendered as
// `https://cleaner.thecleancrew.app&token_hash=...` — no path, no `?`, and the wrong app.
// The CRM had asked to send the invitee to
// `https://crm.thecleancrew.app/en-AU/auth/confirm?employeeInvitation=<uuid>`; the hosted
// allow-list carried that path without a query string, so Auth refused the redirect and
// substituted `site_url`. The invite template joins with `&` because the redirect is
// supposed to carry a query, which turned a wrong link into an invalid one.
//
// Containment cannot catch that: every literal entry was present. The allow-list has to be
// checked by whether it actually permits the URL the CRM asks for.

test("a glob matches within a path segment but does not cross one", () => {
  assert.equal(matchesRedirectPattern("https://a.test/*", "https://a.test/one"), true);
  assert.equal(matchesRedirectPattern("https://a.test/*", "https://a.test/one/two"), false);
  assert.equal(matchesRedirectPattern("https://a.test/**", "https://a.test/one/two"), true);
});

test("an entry without a wildcard does not permit the same path carrying a query", () => {
  // This is the exact production state that broke the invitation.
  assert.equal(
    matchesRedirectPattern(
      "https://crm.thecleancrew.app/en-AU/auth/confirm",
      "https://crm.thecleancrew.app/en-AU/auth/confirm/00000000-0000-4000-8000-000000000000",
    ),
    false,
  );
});

test("a wildcard entry permits the redirect the CRM actually asks for", () => {
  assert.equal(
    matchesRedirectPattern(
      "https://crm.thecleancrew.app/**",
      "https://crm.thecleancrew.app/en-AU/auth/confirm/00000000-0000-4000-8000-000000000000",
    ),
    true,
  );
});

test("the redirects the apps request are stated, both locales and both apps", () => {
  const required = requiredRedirectUrls();

  assert.ok(required.length >= 4);
  for (const locale of ["en-AU", "pt-BR"]) {
    assert.ok(
      required.some((url) => url.includes(`/${locale}/auth/confirm/`)),
      `${locale} employee confirm redirect must be required`,
    );
  }
  assert.ok(
    required.some((url) => url.startsWith("https://crm.thecleancrew.app/")),
    "employee invitations land on the CRM, not the cleaner app",
  );
});

test("an allow-list that refuses a required redirect is drift", () => {
  const productionAsItBroke = [
    "https://crm.thecleancrew.app",
    "https://cleaner.thecleancrew.app",
    "https://crm.thecleancrew.app/en-AU/auth/confirm",
    "https://crm.thecleancrew.app/pt-BR/auth/confirm",
    "https://cleaner.thecleancrew.app/en-AU/auth/confirm",
    "https://cleaner.thecleancrew.app/pt-BR/auth/confirm",
  ].join(",");

  const drift = findAuthDrift(
    buildExpectations({ configToml: configToml() }),
    healthyConfig({ uri_allow_list: productionAsItBroke }),
  );

  const entry = drift.find((item) => item.key === "uri_allow_list");
  assert.ok(entry, "an allow-list that refuses the CRM's redirect must be reported");
  // Auth does not report a refusal — it silently sends the invitee to site_url — so the
  // message has to name what was refused.
  assert.match(entry.actual, /auth\/confirm\//);
});

test("an allow-list with the wildcard entries reports no drift", () => {
  const fixed = [
    "https://crm.thecleancrew.app/**",
    "https://cleaner.thecleancrew.app/**",
    "http://localhost:3000",
  ].join(",");

  const drift = findAuthDrift(
    buildExpectations({ configToml: configToml() }),
    healthyConfig({ uri_allow_list: fixed }),
  );

  assert.deepEqual(drift.filter((item) => item.key === "uri_allow_list"), []);
});

// Custom SMTP (smtp.resend.com) is configured while `rate_limit_email_sent` sat at 2 — the
// built-in-service default, and a per-hour figure for the whole project. Two auth e-mails an
// hour is the best explanation for an invitation revoked 46 ms after it was created on
// 2026-08-25, and it makes the self-service "send me a new link" button unusable.

test("an e-mail allowance left at the built-in default is caught", () => {
  const drift = findAuthDrift(expectations, healthyConfig({ rate_limit_email_sent: 2 }));

  assert.deepEqual(drift.map((entry) => entry.key), ["rate_limit_email_sent"]);
  assert.match(drift[0].actual, /2/);
});

test("a generous e-mail allowance is not drift", () => {
  // The exact figure is an operations choice; only the floor is the repository's business.
  assert.deepEqual(findAuthDrift(expectations, healthyConfig({ rate_limit_email_sent: 100 })), []);
  assert.deepEqual(findAuthDrift(expectations, healthyConfig({ rate_limit_email_sent: 10 })), []);
});
