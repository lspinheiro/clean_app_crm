import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Supabase renders the subject through the same Go template engine as the body, so a
// subject can branch on the invitee's locale. Without that branch the only way to serve
// both languages is a "English / Português" subject, which reads as broken to everyone.

const configPath = fileURLToPath(
  new URL("../packages/db/supabase/config.toml", import.meta.url),
);

const localeBranch =
  /\{\{\s*if eq \.Data\.preferred_locale "pt-BR"\s*\}\}(?<ptBR>.*?)\{\{\s*else\s*\}\}(?<fallback>.*?)\{\{\s*end\s*\}\}/s;

function readSubject(section) {
  const config = readFileSync(configPath, "utf8");
  const sectionBody = config.split(`[${section}]`)[1];
  assert.ok(sectionBody, `config.toml is missing the [${section}] section`);
  const subject = /^subject = "(?<value>.*)"$/m.exec(sectionBody.split("[")[0]);
  assert.ok(subject?.groups?.value, `[${section}] is missing a subject`);
  return subject.groups.value.replaceAll('\\"', '"');
}

const sections = [
  "auth.email.template.invite",
  "auth.email.template.recovery",
];

for (const section of sections) {
  test(`${section} subject renders one language per locale`, () => {
    const subject = readSubject(section);
    const branches = localeBranch.exec(subject);

    assert.ok(
      branches,
      `${section} subject must branch on .Data.preferred_locale, got: ${subject}`,
    );

    const ptBR = branches.groups.ptBR.trim();
    const fallback = branches.groups.fallback.trim();

    assert.ok(ptBR.length > 0, `${section} has an empty pt-BR subject`);
    assert.ok(fallback.length > 0, `${section} has an empty fallback subject`);
    assert.notEqual(
      ptBR,
      fallback,
      `${section} serves the same text to both locales`,
    );
  });

  test(`${section} subject never mixes both languages in one line`, () => {
    const subject = readSubject(section);
    const branches = localeBranch.exec(subject);
    const rendered = branches
      ? [branches.groups.ptBR.trim(), branches.groups.fallback.trim()]
      : [subject];

    for (const line of rendered) {
      assert.doesNotMatch(
        line,
        / \/ /,
        `${section} pairs two languages in one subject: ${line}`,
      );
    }
  });
}
