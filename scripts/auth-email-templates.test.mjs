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

function readTemplate(name) {
  return readFileSync(
    fileURLToPath(new URL(`../packages/db/supabase/templates/${name}`, import.meta.url)),
    "utf8",
  );
}

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

const conditional = /\{\{[-\s]*(?<keyword>else if|else|if|end)\b[^}]*\}\}/g;

/**
 * The branches of the first `{{ if … }}` whose condition mentions `needle`, in source order.
 * Go conditionals nest, so the scan counts depth rather than stopping at the first `{{ end }}`.
 */
function branchesOf(template, needle, label) {
  const tokens = [...template.matchAll(conditional)];
  const opening = tokens.findIndex(
    (token) => token.groups.keyword === "if" && token[0].includes(needle),
  );
  assert.ok(opening >= 0, `${label} never branches on ${needle}`);

  const cuts = [tokens[opening].index + tokens[opening][0].length];
  let depth = 0;
  for (const token of tokens.slice(opening + 1)) {
    const { keyword } = token.groups;
    if (keyword === "if") {
      depth += 1;
    } else if (keyword === "end") {
      if (depth === 0) {
        cuts.push(token.index);
        break;
      }
      depth -= 1;
    } else if (depth === 0) {
      cuts.push(token.index, token.index + token[0].length);
    }
  }

  assert.equal(cuts.length % 2, 0, `${label} leaves the ${needle} branch unclosed`);
  const branches = [];
  for (let index = 0; index < cuts.length; index += 2) {
    branches.push(template.slice(cuts[index], cuts[index + 1]));
  }
  return branches;
}

// CLE-100. The company was named and the person who sent the invitation was not — and in an
// inbox the sender is the strongest signal there is. Both Auth templates carry both names, and
// a template that carries them in one language only serves half the cohort.
for (const name of ["invite.html", "recovery.html"]) {
  test(`${name} names the company and the inviter in both languages`, () => {
    const template = readTemplate(name);
    const [employee] = branchesOf(template, "invitation_kind", name);
    const localised = branchesOf(employee, "preferred_locale", `${name} employee content`);

    assert.equal(
      localised.length,
      2,
      `${name} serves ${localised.length} employee languages, expected two`,
    );

    for (const [index, branch] of localised.entries()) {
      for (const field of [".Data.company_name", ".Data.inviter_name"]) {
        assert.ok(
          branch.includes(field),
          `${name} employee language ${index + 1} never reads ${field}`,
        );
      }
    }
  });
}

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
