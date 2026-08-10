# AGENTS.md

Operating notes for this repository. `CLAUDE.md` imports this file so the same rules apply across
agent environments.

## Purpose

Company-side **CRM and system of record** for commercial cleaning operators (Gold Coast, QLD):
clients, sites, recurring assignments, rosters, and the vacancies they produce. Vacancies are
posted to each company's private cleaner pool and, in later stages, distributed to WhatsApp groups
and a recruitment funnel. The sibling repo `../clean-app` is the deployed cleaner/boss prototype;
the long-term intent is one monorepo here, with the cleaner app migrating in as `apps/cleaner`.

Product source of truth:

- `docs/PRODUCT.md` — product strategy and requirements: features F1–F13, user journeys
  (CA-*/CL-*/OP-*), release stages (alpha → MVP → P1), metrics, risks. Synced from the private
  `personal_website` repo (`projects/cleaner-app/PRODUCT.md`), which also holds the companion
  `prototype-and-strategy-review.md` (why the CRM core is the free base and how the prototype
  maps onto it).

When a task references a feature (e.g. "F10", "CA-6") resolve it against `docs/PRODUCT.md`
before coding.

## Structure and conventions

pnpm workspace monorepo; members are `apps/*` and `packages/*`. No app code at the root.

- `apps/crm/` — the CRM (Next.js). Not yet created; first real code lands here.
- `apps/cleaner/` — the cleaner app: a minimal parity port of `../clean-app`'s cleaner
  loop, landing with the first build cycle (`docs/design/phase-a-adoption.md`).
- `packages/db/` — reserved: Supabase schema, migrations, seed, generated types shared by apps.
- `packages/ui/` — reserved: shared design tokens/components.
- `docs/` — hand-authored documentation: `PRODUCT.md` (product strategy), `design/` (design docs
  from grilling sessions — see the **grill-with-docs** skill), `decisions/` (ADRs),
  `glossary.md`. The generated `openwiki/` index is separate — see the **openwiki** skill.
- Execution tracking lives in **Linear** (workspace `cleanerapp`) — see the **issue-tracker**
  skill for the design doc = Project / Milestone / Issue mapping and the `linear.py` API helper
  (`LINEAR_API_KEY` from the environment; never commit it). Planning ladder: `grill-with-docs`
  → `to-features` → `to-issues`.
- **Skills are authored in `.agents/skills/`** (the agent-portable location, mirroring how
  `CLAUDE.md` imports `AGENTS.md`); `.claude/skills` is a symlink to it, so Claude and Codex
  read the same files. Author and edit skills under `.agents/skills/` only — never create a
  real directory at `.claude/skills`, and reference skill files by their `.agents/skills/…`
  paths.
- `ai-engineering-wiki` (symlink, gitignored, this machine only) — read-only personal research
  wiki for prior art; never referenced from committed files.

Run everything through pnpm from the repo root: `pnpm install`, `pnpm --filter crm <cmd>` (alias:
`pnpm crm <cmd>`). Do not use npm or yarn; do not add a lockfile other than `pnpm-lock.yaml`.

## Tech stack (fixed)

Next.js (App Router) + React + TypeScript; Tailwind CSS v4; Postgres via **Supabase** (auth,
migrations, RLS); **Vercel** for hosting. PWA + Web Push for notifications — no native apps.
The `../clean-app` prototype is reference material, not runtime and not authority: it
demonstrates the core job-matching loop, and the alpha runs entirely on monorepo apps
(`docs/decisions/0002`). Consult it for mechanics (RPC patterns, push plumbing) and for
visual fidelity on parity screens; wherever its UI/UX and `docs/PRODUCT.md` disagree,
PRODUCT.md wins. Never carry its "boss" jargon — say *cleaning company* / *company admin*;
the role enum is `company_admin` / `cleaner` / `admin` and "boss" appears nowhere.
Conventions carried over from the prototype:

- **UI in English**; currency AUD; timezone `Australia/Brisbane`.
- **Roles**: `company_admin` / `cleaner` / `admin` (internal), enforced in layouts and route
  guards.
- **Flow mutations are Postgres RPCs** (security definer, atomic): apply, assign, status changes,
  cancel, mark paid, mark dropped. Assignment races resolve first-accept-wins.
- **Cleaner privacy boundary**: cleaners read through dedicated views and mutate through RPCs —
  never direct selects on company tables. A cleaner sees a site's full address and access notes
  only after assignment, and never sees the client's phone, the client charge, or internal notes.
- **Explicit grants**: every new table in a migration needs explicit `grant` statements to
  `authenticated` (and `service_role`) — the Supabase PG17 image does not grant DML
  automatically; missing grants surface as silent 42501 failures.
- **Free-tier discipline**: select only needed columns, prefer push over e-mail, keep payloads
  small.

## Product rules code must always respect

These come from the compliance and trust positions in `PRODUCT.md`; they are product law, not
preferences:

- **No money movement.** The pay ledger records agreed amounts and settlement state; it never
  transfers funds. No payment surface for candidates exists at all (workers are never charged
  fees — QLD private-employment-agent rules).
- **Reviews are structured only.** No free-text public ratings of cleaners anywhere (defamation
  boundary). Reviews accumulate per cleaner and per client–cleaner pair.
- **Vacancy is the connecting object.** Roster gaps, uncovered instances, and dropouts all
  produce a vacancy; distribution features (board, cascade, share links, agents) consume
  vacancies. Do not build outbound features that bypass it.
- **Jobs carry crew size ≥ 1** with per-slot assignment; recurring assignments generate job
  instances. Retrofitting these later touches every screen — they are in the model from day one.
- **Agent autonomy is enforced server-side** per capability (PRODUCT.md §4.4) once AI features
  land;
  outbound message content from templates or approved drafts only; pay figures always come from
  the job record.
- **Sensitive data**: criminal-history and vetting outcomes are status + expiry only, never raw
  records; ID documents in restricted storage; site addresses/access notes are assignment-gated
  and access-logged.

## Design quality

Two sides, one contract. **Generation**: [Stitch](https://stitch.withgoogle.com/) (remote
MCP, `STITCH_API_KEY` in `.envrc`) produces screen designs before implementation, via the
repo's **design-explore** skill. **Judgement**: [impeccable](https://impeccable.style/)
(user-level skill; `.impeccable/` here holds hook consent) reviews both Stitch mockups
(critique-only) and implemented code, via the repo's **design-review** skill: per-journey
loops of detect → critique → audit → prioritised fixes → re-verify, findings published to
Linear at mapped priority. Generation and refinement never share a session; Stitch does not
re-enter after implementation starts.

The contract is **`DESIGN.md`**: the repo's root file is canonical for all three consumers
(Stitch generation, impeccable review, the code); the Stitch design-system object is derived
from it (`upload_design_md` → apply at project level) and re-uploaded after changes, never
edited in Stitch. The [stitch-skills](https://github.com/google-labs-code/stitch-skills)
plugin is deliberately **not installed** — its useful process content is adapted into
design-explore (two prompting reference files vendored, Apache 2.0); its build-plugin code
generators are unused because Stitch output is reference material, never merged code.

Context-file conventions (impeccable resolves from app root up, never `docs/`):

- Root `DESIGN.md` — the single visual world for both apps, seeded from the prototype's
  tokens; created via `/impeccable init` + hand-editing once `apps/crm` has first screens.
- `apps/<app>/PRODUCT.md` — compact surface brief distilled from `docs/PRODUCT.md` (which
  stays the strategy source of truth).
- CI gate: `.github/workflows/design-detect.yml.disabled` — rename to enable once real UI
  exists.

## Release framing

User journeys (PRODUCT.md §3) are the roadmap unit: a build cycle implements journeys end-to-end
and releases them to the test cohort. Current stage is the **internal alpha** (PRODUCT.md §3.4):
the six-item
build delta listed in this repo's README, on top of what the prototype already proves. Do not pull
MVP/P1 features (share links, vetting, reviews, messaging, AI, WhatsApp) into alpha work.

## Stage discipline — build fast, never invent requirements

Four cofounders are ideating and validating designs and features; nothing is
customer-facing yet. The delivery progression is deliberate, and each step is entered
only when the founders say so:

1. **Prototype fast** — a first pass built for speed, exercised on dev machines.
2. **Internal testing** — cofounders try it locally; qualitative feedback drives changes.
3. **Single internal deployment** — one environment, manual deploys, still
   internal-facing only.
4. **Product launch** — only here do end-customer telemetry/analytics (e.g. PostHog),
   observability, CI/CD, and multi-environment setups get investment. The founders will
   raise productionisation explicitly (most likely in a grilling session) when the time
   comes — never schedule or scaffold it on your own initiative.

Two standing rules follow, for every agent at every rung of the ladder:

- **A requirement exists only if the founders stated it** — in `docs/PRODUCT.md`, a
  design doc, or the conversation itself. Never add analytics, telemetry, metrics
  collection, observability, monitoring, CI/CD, staging environments, or other
  productionisation work to a design doc, Milestone, Issue, or code because it seems
  like best practice. (Tests are unaffected: they stay in every slice as
  definition-of-done, run locally.)
- **Ask intent — don't fill the gap.** When a plan seems to need something the founders
  haven't said, ask a clarifying question instead of writing an assumption into a
  document. An assumption written into a design doc propagates down the whole planning
  ladder (design doc → Milestones → Issues → code) and is hard to spot in a long
  document, so it must be caught at the question stage.

## Engineering delivery

For any production behaviour change, load and follow the **disciplined-delivery** skill.
The law, tier-independent:

- **Single writer.** Parallel agents may explore, analyse, and review; only the main
  agent edits the working tree.
- **Ceremony scales with blast radius, not ticket size** (tiers T0–T2 in the skill).
  Product-law surfaces, migrations/RPCs/RLS, and auth are always full-discipline.
- **No production edits before a demonstrated RED** — a focused test failing *because the
  behaviour is missing*, not from syntax/imports/fixtures — unless a declared exception
  applies (docs-only, config-only, generated code, pure refactor under existing tests,
  test-infra repair).
- **Never weaken, delete, skip, or broadly mock tests to reach GREEN.**
- **Scenarios come from the ladder** (issue acceptance criteria, design doc journeys);
  don't test — or build — beyond the slice's scope without flagging it.
- **Evidence over claims:** completion requires the tier's evidence note (RED/GREEN
  commands and exit codes, gates run) in the conversation; never report a check as passed
  that was not run.

## Code review rules

Applies to all reviews of this repo — Claude `/code-review`, Codex `/review`, and human
review alike.

- A finding must carry: severity (P0 immediate/catastrophic · P1 serious correctness,
  security, or data-loss · P2 should fix before merge · P3 non-blocking), confidence,
  exact file:line or symbol, concrete evidence, real-world impact, and the smallest
  appropriate remediation.
- No style-only or formatting findings (CI owns formatting/lint); no "violates SOLID"
  without naming the concrete coupling, responsibility, substitutability, interface, or
  dependency consequence.
- Test findings must explain how the test could pass while the behaviour stays broken;
  check that tests would fail if the implementation were reverted.
- Check the surrounding code before claiming validation, authorisation, cleanup, or error
  handling is absent. Prefer one precise finding over several overlapping ones.
- **Product-law lens (always on):** flag any change that moves money, exposes client
  phone/charge/address outside assignment gating, adds free-text public ratings, bypasses
  the vacancy model, weakens RLS/grants or the `cleaner_*` view boundary, or hard-codes an
  autonomy level above the PRODUCT.md §4.4 matrix.
- **TypeScript design bar:** dependency direction UI → domain → data with mutations
  through RPCs; interfaces no wider than their consumers need; discriminated unions with
  exhaustive switches; validation at trust boundaries (`zod` or equivalent); no `any`,
  unsafe casts, or silently-swallowed errors; names from `docs/glossary.md`.

## Working agreements

- Prose in docs is en-GB / Australian spelling; never respell code identifiers.
- Never commit secrets: `.env*` stays untracked, `.env.example` stays current.
- Seed/demo credentials belong in seeds and docs, clearly marked demo; never real client data in
  fixtures.
- Do not commit or push without being asked.

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
