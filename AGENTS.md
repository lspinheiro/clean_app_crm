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
- `apps/cleaner/` — reserved for the migrated cleaner app.
- `packages/db/` — reserved: Supabase schema, migrations, seed, generated types shared by apps.
- `packages/ui/` — reserved: shared design tokens/components.
- `docs/` — hand-authored documentation: `PRODUCT.md` (product strategy), `design/` (design docs
  from grilling sessions — see the **grill-with-docs** skill), `decisions/` (ADRs),
  `glossary.md`. The generated `openwiki/` index is separate — see the **openwiki** skill.
- Execution tracking lives in **Linear** (workspace `cleanerapp`) — see the **issue-tracker**
  skill for the design doc = Project / Milestone / Issue mapping and the `linear.py` API helper
  (`LINEAR_API_KEY` from the environment; never commit it). Planning ladder: `grill-with-docs`
  → `to-features` → `to-issues`.
- `ai-engineering-wiki` (symlink, gitignored, this machine only) — read-only personal research
  wiki for prior art; never referenced from committed files.

Run everything through pnpm from the repo root: `pnpm install`, `pnpm --filter crm <cmd>` (alias:
`pnpm crm <cmd>`). Do not use npm or yarn; do not add a lockfile other than `pnpm-lock.yaml`.

## Tech stack (fixed)

Next.js (App Router) + React + TypeScript; Tailwind CSS v4; Postgres via **Supabase** (auth,
migrations, RLS); **Vercel** for hosting. PWA + Web Push for notifications — no native apps.
Match the prototype's conventions so migration stays cheap; when in doubt, read how
`../clean-app` does it first. Conventions carried over from the prototype:

- **UI in English**; currency AUD; timezone `Australia/Brisbane`.
- **Roles**: `boss` / `cleaner` / `admin` (internal), enforced in layouts and route guards.
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

## Release framing

User journeys (PRODUCT.md §3) are the roadmap unit: a build cycle implements journeys end-to-end
and releases them to the test cohort. Current stage is the **internal alpha** (PRODUCT.md §3.4):
the six-item
build delta listed in this repo's README, on top of what the prototype already proves. Do not pull
MVP/P1 features (share links, vetting, reviews, messaging, AI, WhatsApp) into alpha work.

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
