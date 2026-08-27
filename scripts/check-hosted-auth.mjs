import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Hosted auth is dashboard-managed. `config.toml`'s [auth] block configures a developer
// machine and never reaches the project: the release pushes migrations and Edge Functions
// only, and `supabase config push` is not usable here — it ignored the `[remotes]`
// overrides on CLI 2.114.0 (site_url became 127.0.0.1, the allow-list was replaced,
// `mailer_autoconfirm` flipped on), and it fails on storage settings outside a paid tier.
//
// So this reads and never writes. It exists because the drift was invisible: `otp_expiry`
// said seven days in config.toml from 2026-08-20 while the project ran the 3600-second
// default, and every employee invitation died an hour after an e-mail promising a week.
// Nobody found out until an invitee reported it.

const configPath = fileURLToPath(
  new URL("../packages/db/supabase/config.toml", import.meta.url),
);

/** The origin auth e-mails fall back to when a redirect is refused. */
const productionSiteUrl = "https://cleaner.thecleancrew.app";
/**
 * Reads a `key = value` line out of one config.toml section, stopping at the next section
 * so a key repeated under a later heading cannot be picked up by mistake.
 */
function readConfigValue(configToml, section, key) {
  const afterHeading = configToml.split(`[${section}]`)[1];
  if (afterHeading === undefined) return undefined;
  const sectionBody = afterHeading.split("\n[")[0];
  const match = new RegExp(`^${key} = (?<value>.*)$`, "m").exec(sectionBody);
  return match?.groups?.value?.trim();
}

function readQuoted(configToml, section, key) {
  const raw = readConfigValue(configToml, section, key);
  if (raw === undefined) return undefined;
  return raw.replace(/^"|"$/g, "").replaceAll('\\"', '"');
}

/**
 * Supabase matches a redirect against the allow-list as a glob over the whole URL, query
 * string included: `*` stays inside one path segment, `**` crosses them, `?` is a single
 * character. A refused redirect is not reported to the caller — Auth quietly substitutes
 * `site_url` — so this has to be checked here rather than observed in production.
 */
export function matchesRedirectPattern(pattern, url) {
  const source = pattern
    .split("")
    .reduce((parts, character, index, characters) => {
      if (character === "*" && characters[index - 1] === "*") return parts;
      if (character === "*") {
        parts.push(characters[index + 1] === "*" ? "[\\s\\S]*" : "[^/]*");
        return parts;
      }
      if (character === "?") {
        parts.push("[\\s\\S]");
        return parts;
      }
      parts.push(character.replaceAll(/[.+^${}()|[\]\\]/g, "\\$&"));
      return parts;
    }, [])
    .join("");

  return new RegExp(`^${source}$`).test(url);
}

/**
 * The redirects the apps actually ask Auth for. The employee one carries a query string,
 * which is what a literal allow-list entry silently refuses — the invitation e-mail then
 * renders `site_url` with `&token_hash=` appended and reaches the invitee malformed.
 */
export function requiredRedirectUrls() {
  const sampleInvitation = "00000000-0000-4000-8000-000000000000";
  const locales = ["en-AU", "pt-BR"];

  return [
    // The employee invitation rides in the path. It was a query parameter until 2026-08-27,
    // which is what a literal allow-list entry refused; keeping a query-carrying URL here
    // would guard a shape the apps no longer ask for.
    ...locales.map(
      (locale) =>
        `https://crm.thecleancrew.app/${locale}/auth/confirm/${sampleInvitation}`,
    ),
    ...locales.map((locale) => `https://crm.thecleancrew.app/${locale}/auth/confirm`),
    ...locales.map((locale) => `https://cleaner.thecleancrew.app/${locale}/auth/confirm`),
  ];
}

/**
 * config.toml stays authoritative wherever it can be — a second copy of `otp_expiry` here
 * would be one more thing to drift. `site_url` and the allow-list cannot be derived,
 * because the file describes localhost, so they are stated with the reason attached.
 */
export function buildExpectations({ configToml } = {}) {
  const toml = configToml ?? readFileSync(configPath, "utf8");

  // A value this file can no longer read is not "nothing to check" — it is the guard
  // quietly switching itself off. Deleting `otp_expiry` from config.toml must break the
  // release loudly, not restore the silence this script exists to end.
  const derive = (reader, section, key) => {
    const value = reader(toml, section, key);
    if (value === undefined) {
      throw new Error(`config.toml is missing [${section}] ${key}, so hosted auth cannot be checked against it`);
    }
    return value;
  };

  const otpExpiry = derive(readConfigValue, "auth.email", "otp_expiry");
  const enableSignup = derive(readConfigValue, "auth", "enable_signup");

  return [
    {
      key: "mailer_otp_exp",
      expected: Number(otpExpiry),
      why: "the invitation e-mail promises seven days; a shorter token kills the link first",
    },
    {
      key: "rate_limit_email_sent",
      match: "atLeast",
      expected: 10,
      why: "custom SMTP is configured; the built-in default of 2 an hour starves invitations",
    },
    {
      key: "mailer_autoconfirm",
      expected: false,
      why: "an invitee must prove they own the address before the account is confirmed",
    },
    {
      key: "disable_signup",
      expected: enableSignup !== "true",
      why: "CL-1 registers cleaners from the invite link",
    },
    {
      key: "site_url",
      expected: productionSiteUrl,
      why: "auth e-mail links are built from this origin",
    },
    {
      key: "uri_allow_list",
      match: "permits",
      expected: requiredRedirectUrls(),
      why: "a refused redirect is replaced by site_url, which sends the invitee to the wrong app with a malformed link",
    },
    {
      key: "mailer_subjects_invite",
      expected: derive(readQuoted, "auth.email.template.invite", "subject"),
      why: "one language per locale, not a slash-joined pair",
    },
    {
      key: "mailer_subjects_recovery",
      expected: derive(readQuoted, "auth.email.template.recovery", "subject"),
      why: "one language per locale, not a slash-joined pair",
    },
  ];
}

/**
 * Returns one entry per setting that has moved. Extra allow-list origins are fine — a
 * preview URL must not fail a release — but losing a production one is not.
 */
export function findAuthDrift(expectations, actual) {
  const drift = [];

  for (const expectation of expectations) {
    const observed = actual?.[expectation.key];

    // A floor rather than an exact value: how much e-mail the project may send is an
    // operations choice, but leaving it at the built-in default starves the invitation flow.
    if (expectation.match === "atLeast") {
      if (typeof observed !== "number" || observed < expectation.expected) {
        drift.push({
          key: expectation.key,
          expected: `at least ${expectation.expected}`,
          actual: observed === undefined ? "(absent)" : String(observed),
          why: expectation.why,
        });
      }
      continue;
    }

    if (expectation.match === "permits") {
      const patterns = String(observed ?? "").split(",").map((entry) => entry.trim())
        .filter(Boolean);
      const refused = expectation.expected.filter(
        (url) => !patterns.some((pattern) => matchesRedirectPattern(pattern, url)),
      );
      if (refused.length > 0) {
        drift.push({
          key: expectation.key,
          expected: `patterns permitting ${refused.length} refused redirect(s)`,
          actual: `refuses ${refused.join(", ")}`,
          why: expectation.why,
        });
      }
      continue;
    }

    // An absent key is drift: a project that stopped reporting a setting has not agreed
    // with the repository, it has stopped answering the question.
    if (observed !== expectation.expected) {
      drift.push({
        key: expectation.key,
        expected: expectation.expected,
        actual: observed === undefined ? "(absent)" : observed,
        why: expectation.why,
      });
    }
  }

  return drift;
}

export async function checkHostedAuth({
  accessToken,
  projectRef,
  configToml,
  fetchImpl = fetch,
  log = console.error,
} = {}) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      drift: [],
      error: `Supabase Management API returned ${response.status}. ${body}`.trim(),
    };
  }

  let expectations;
  try {
    expectations = buildExpectations({ configToml });
  } catch (error) {
    return { ok: false, drift: [], error: error.message };
  }

  const drift = findAuthDrift(expectations, await response.json());
  if (drift.length === 0) return { ok: true, drift: [] };

  log("Hosted auth configuration has drifted from this repository:");
  for (const entry of drift) {
    log(`  ${entry.key}`);
    log(`    expected: ${entry.expected}`);
    log(`    hosted:   ${entry.actual}`);
    log(`    why:      ${entry.why}`);
  }
  log("");
  log("Fix these in Supabase → Authentication, then re-run. This check never writes.");

  return { ok: false, drift };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_ID;
  if (!accessToken || !projectRef) {
    console.error(
      "SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID are required to read hosted auth.",
    );
    process.exit(1);
  }

  const result = await checkHostedAuth({ accessToken, projectRef });
  if (!result.ok) {
    if (result.error) console.error(result.error);
    process.exit(1);
  }
  console.log("Hosted auth configuration matches this repository.");
}
