# Phase A — company onboarding and pool adoption (alpha)

- **Status:** in delivery
- **Stage:** alpha
- **Journeys:** CA-1, CL-1, OP-1 designed end-to-end; CA-2…CA-5, CL-2…CL-4 served at
  prototype parity (capability re-housed into monorepo apps, not redesigned)
- **Features:** F10 (clients, sites, recurring assignments, roster), F11 (pool, board,
  dispatch — parity port), F1 (company record incl. ABN), F4/F5 (consent and availability
  explicitly deferred — see Scope)
- **Project:** https://linear.app/cleanerapp/project/phase-a-company-onboarding-and-pool-adoption-fa89a1783aad
- **Design reference:** Stitch `clean-app-crm`
  (stitch.withgoogle.com/projects/14703266792285619940): CA-1-roster `3af77dd5…`,
  CA-1-clients `f956011f…`, CA-1-client-detail `771d4b52…`, CA-1-company-settings
  `312d2c03…`; Stitch `clean-app-cleaner`
  (stitch.withgoogle.com/projects/11393108481758850289): CL-1-join `931ca756…` (Poppins
  correction of `9efcc6c3…`). CA-1-recurring-assignments timed out at the MCP layer twice
  — check the project UI for a completed copy or regenerate from the prompt on record.
  Caveat: the cleaner project's derived design-system asset mis-picked Plus Jakarta Sans;
  re-derive from DESIGN.md before generating more cleaner screens.
- **Date:** 2026-08-08 · grilling session with Leonardo

## Goal

A real cleaning company can be put into the app in one sitting — company details, clients
and their sites, the recurring schedule, and its existing cleaners in the pool — so that
the next morning the roster shows its actual week (assigned regulars and gaps as
vacancies) and cleaners see and take open work. This is the make-or-break adoption moment
of PRODUCT.md §3.2 Phase A, delivered entirely on monorepo apps: the deployed prototype is
reference material, not runtime.

## Context

First build cycle of the internal alpha (PRODUCT.md §3.4). The repo is scaffold-only; the
sibling prototype (`../clean-app`) proves the matching loop and supplies the visual
reference and mechanics patterns. Session findings that shaped this design: the
prototype's `job_series` table is schema-only (no app code, no generation mechanism —
recurrence is greenfield); its `clients` rows merge client and site; assignment is a
single cleaner per job; pool join is signup plus manual code entry with no phone/suburb
capture. Mid-session the plan pivoted from "prototype runs unmodified alongside the CRM"
to "monorepo apps only" (decision 0002), which dissolved the compatibility constraints the
early decisions had been working around.

## Decisions

- **Authority runs PRODUCT.md → this repo → prototype.** The prototype demonstrated the
  matching loop; it is reference-only. Where its UI/UX and PRODUCT.md disagree, PRODUCT.md
  wins. Its "boss" jargon never enters UI, docs, or identifiers — we say company admin
  (glossary).
- [0001 — fresh Supabase project; `packages/db` owns the canonical schema, seeded by
  adapting the prototype's migrations, then evolved
  freely](../decisions/0001-alpha-database-fresh-supabase-project.md).
- [0002 — the alpha runs entirely on monorepo apps (`apps/crm` + minimal `apps/cleaner`);
  the prototype never runs against the alpha
  database](../decisions/0002-alpha-runs-on-monorepo-apps-only.md).
- [0003 — Vacancy is a view over unfilled crew slots, not a
  table](../decisions/0003-vacancy-as-projection.md).
- [0004 — `apps/cleaner` is a wrapper-ready PWA: client-first and static-exportable, so a
  Capacitor store shell stays a bolt-on if alpha iOS push evidence demands it; acquisition
  always stays web](../decisions/0004-cleaner-surface-wrapper-ready-pwa.md) *(added
  2026-08-12)*.
- **Clean vocabulary from the first migration:** `clients` (commercial party) and `sites`
  (address, access notes, defaults) as separate tables, jobs FK to the site,
  `recurring_assignments`, role enum `company_admin` / `cleaner` / `admin`.
- **Crew slots from day one** (product law, AGENTS.md): `jobs.crew_size ≥ 1` plus a
  per-slot `job_assignments` table; the cleaner-overlap exclusion and the pay ledger key
  on (job, cleaner) — one ledger entry per slot, not per job. Admin assignment from
  applicants stays admin-picks; first-accept-wins enters with the cascade (cycle 2).
- **Auto-assign, no acceptance:** instances generated from a recurring assignment with a
  named cleaner are created already assigned — the roster records reality; Maria does not
  re-accept her Tuesdays. Declining becomes the dropout flow (cycle 2).
- **Recurring assignment shape:** one row per weekday (weekly/fortnightly; "Mon/Wed/Fri"
  is three rows), `crew_size`, named cleaners in a side table filled in slot order at
  generation.
- **Generation:** nightly pg_cron in `Australia/Brisbane` plus immediate generation on
  create/edit; 28-day horizon; idempotent per (assignment, service date). Edits regenerate
  future instances that are still untouched; never touch started, completed, or manually
  edited ones. Instances with no named cleaner generate as `posted` — they are the
  vacancies on the board.
- **Push discipline:** auto-assignments and generated postings do not fire per-instance
  push — only manually posted jobs notify the pool in this cycle. Otherwise the nightly
  run spams every cleaner with a month of jobs.
- **Preferred cleaners:** ordered list per site, captured at onboarding; consumed by board
  ordering and the cascade in later cycles.
- **CL-1 is link-first, per PRODUCT.md:** the invite is a real link into `apps/cleaner` —
  one-minute registration (name, phone, suburb), pool joined, PWA install prompt and push
  opt-in, board immediately visible. This surface is the seed of F12's magic-link
  registration (MVP).
- **UI fidelity rule:** parity screens in `apps/cleaner` (board, my jobs, money) keep
  visual fidelity to the prototype; new screens (CRM roster, clients, company setup, the
  join/registration flow) go through design-explore governed by `DESIGN.md`, seeded from
  the prototype's tokens.
- **Concierge tooling (OP-1):** CSV templates plus seed scripts run with the service role
  — "direct tooling, no console" per PRODUCT.md §3.2. The apps' own forms are used live
  during the onboarding session; scripts handle bulk entry.
- **Company record:** ABN captured at onboarding; alpha companies are seeded as approved.

## Requirements & user journeys

**CA-1 — Set up the company (concierge).** At the end of one onboarding session a real
company exists with: ABN; at least one multi-site client and single-site clients; per-site
defaults (service, duration, rate) and ordered preferred cleaners; recurring assignments
covering its regular week, including at least one crew-size-2 job; the pool invite link
posted into the company's WhatsApp group. Next morning the roster week view shows the
actual week: auto-assigned instances by cleaner and by site, unfilled slots highlighted as
vacancies with a count ("2 unfilled slots this week"). Roster pivots per cleaner and per
site (PRODUCT.md §3.6 wireframe), week navigation, mobile and desktop. States: empty
(pre-onboarding), loading, populated week, gap-highlighted.

**CL-1 — Join the pool.** From the WhatsApp invite link to seeing open jobs in under two
minutes, all inside `apps/cleaner`: registration (name, phone, suburb), pool joined
automatically, PWA install prompt and push opt-in, board lists open slots immediately.

**OP-1 — Concierge onboarding.** The ops teammate turns a company's spreadsheet and group
chat into seeded records: CSV templates → seed script → verified roster week. Every
friction point is logged; the friction log is the journey's deliverable and feeds the MVP
self-serve backlog.

**Parity port — `apps/cleaner` (minimal).** The prototype's cleaner loop, re-housed at
capability parity with visual fidelity: board of open vacancies across joined pools,
one-tap apply and withdraw with a visible waiting state, my jobs with assignment-gated
address/access notes and maps handoff, status taps (on the way / in progress / done),
money view (to receive / received), push opt-in and web-push delivery, profile with pools.
Build constraint (decision 0004, 2026-08-12): client-first and static-exportable — client
Supabase SDK against the cleaner views/RPCs, PKCE client auth (not the SSR cookie
pattern), push registration behind one abstraction module, app-shell offline caching via
the service worker.

**Parity port — `apps/crm` dispatch (minimal).** Job detail with applicant list and
per-slot assign; one-off job creation (client → site, service, time, crew size, pay);
money list with mark-paid; job cancel. These serve CA-2…CA-5 and CL-4 at parity until the
Phase B/C cycle designs them properly.

**Acceptance for the cycle:** the three designed journeys pass their stages above, and
every §3.4 "kept from the prototype" capability demonstrably works across the two monorepo
apps — auth and roles, pools and invites, job creation, post/assign, one-tap apply,
address gating, job-done, pay ledger recording, push.

**Instrumentation** (via `product_events`): company onboarded, client/site created,
recurring assignment created, jobs generated, pool joined, application, assignment,
completion. This makes the §6.1 activation metric (≥ 1 client + ≥ 1 recurring assignment
+ ≥ 3 pool members within 14 days) and the schedule-depth exit metric (jobs from recurring
assignments ÷ completed jobs) computable from day one.

## Data & privacy notes

Schema (clean names, first migration set): `companies` (+ ABN), `profiles` (role enum
`company_admin`/`cleaner`/`admin`), `company_members`, `company_invites`, `clients`,
`sites` (address, access notes, defaults, ordered preferred cleaners), `services`,
`recurring_assignments` (+ per-slot named cleaners), `jobs` (site FK, `crew_size`),
`job_assignments` (per-slot; overlap exclusion; assignment history timestamps),
`job_applications`, `ledger_entries` (per job + cleaner), `notifications` + web-push
infrastructure (VAPID, service worker, dispatch route — ported pattern), `product_events`,
and the vacancy view. Every table gets explicit grants to `authenticated` and
`service_role` (AGENTS.md — missing grants are silent 42501s) and company-scoped RLS for
company admins. Product-law checks: cleaners read only through dedicated views and mutate
only through security-definer RPCs — now our contract, designed once, with the
assignment-gated address/access-notes boundary keyed on the cleaner's slot assignment;
cleaners never see client phone, client charge, or internal notes; the pay ledger records
and never moves money; no candidate-side payment or free-text review surface exists;
vacancy remains the connecting object (the view is the only gap interface the roster and
board consume).

## Scope

- **In:** alpha build-delta items 1–3 (§3.4); `packages/db` with the adapted schema
  baseline and fresh Supabase project; `apps/crm` (roster, clients/sites, recurring
  assignments, pool, company settings, minimal dispatch); `apps/cleaner` (parity port +
  link-first join); concierge seed tooling; `DESIGN.md` seeding + design-explore for the
  new screens; instrumentation.
- **Out:** availability toggle and staleness (CL-5, cycle 2), dropout/urgent backfill
  (CA-6/CL-6, cycle 2), first-job marker and outcome capture (CA-9, cycle 2), structured
  reviews, share links, vetting, messaging, AI, WhatsApp automation (MVP/P1 per §3.4),
  self-serve company signup (alpha is concierge, invite-only).

## Open questions

- Co-founder alignment (PRODUCT.md Appendix B q1): the alpha no longer depends on their
  code or deployment, but adapting the prototype's schema and UI patterns into this repo
  belongs in the IP/roles conversation — have it before the cohort (their employers)
  onboards.
- Resolved 2026-08-12: `docs/PRODUCT.md` is now canonical in this repo (the
  `personal_website` sync is retired) and revision v0.4 applies both pending changes —
  §3.2/§3.4 reworded per decision 0002, and the exit-criteria list replaced by qualitative
  partner validation (product decision 2026-08-10).
- Does any alpha company need daily-frequency recurring assignments? Weekly/fortnightly
  covers the known cohort; extend on evidence (feeds Appendix B q3 sizing).
- Generation horizon (28 days) and notification discipline to be sanity-checked against
  week-one concierge feedback.
