# The Clean Crew CRM

The company-side platform for commercial cleaning operators: a free system of record for clients,
sites, recurring assignments, and rosters, which posts open positions (vacancies) that cleaners
pick up in the companion cleaner app.

Gold Coast, QLD, Australia · UI in English · currency AUD · timezone `Australia/Brisbane`.

## Project goals

1. **Be the system of record for cleaning jobs.** Companies manage clients, sites, recurring
   assignments, one-off jobs, and a week-ahead roster here. Once the schedule lives in the
   product, every outbound action derives from it: a roster gap, an uncovered job instance, or a
   dropout produces a fully specified **vacancy** (site, time, duration, rate, preferred-cleaner
   order), and pool offers, push notifications, and recruitment posts are consumers of vacancies.
2. **Post positions, fill them fast.** Vacancies go to the company's private cleaner pool for
   one-tap application, to a preference-ordered urgent-backfill cascade on dropouts, and (later)
   to the company's WhatsApp groups via share links with magic-link registration.
3. **Stay free at the core.** Scheduling, dispatch, and recruitment are permanently free; the data
   they capture is the basis for a later paid tier of AI-assisted admin automation (invoicing,
   calendar ingestion, verification, reminders).
4. **One codebase, prototype as reference.** The sibling repository
   [`../clean-app`](../clean-app) is the deployed two-sided prototype
   (https://clean-app-gamma-inky.vercel.app). It proves the job-matching loop but is reference
   material, not runtime: the alpha runs entirely on this monorepo's apps — `apps/crm` for the
   company side and a minimal `apps/cleaner` carrying the prototype's cleaner loop at parity
   (see `docs/decisions/0002`). Wherever prototype UI/UX and `docs/PRODUCT.md` disagree,
   PRODUCT.md wins.

Full product context (product strategy, prototype review, research) lives in the private
`personal_website` repo under `projects/cleaner-app/` — see `PRODUCT.md` there for features (F1–F13),
user journeys (CA-*/CL-*/OP-*), and release stages.

## Current scope: internal alpha

A minimal CRM layered on the prototype's model, tested with the founding team's own companies.
The alpha backlog, end to end:

1. Clients and sites as first-class records (address, access notes, default service/duration/rate,
   ordered preferred cleaners).
2. Recurring assignments that generate job instances, with crew size ≥ 1.
3. Roster week view per cleaner/site with unfilled slots surfaced as vacancies.
4. Dropout handling: mark dropped → urgent re-post to the pool board + push blast.
5. "Available today" toggle on cleaner profiles, shown on applicant lists.
6. First-job marker and completion-outcome capture (including no-show).

Out of alpha scope: public signup, share links, vetting, structured reviews, messaging, AI
features, WhatsApp integration of any kind, payments (the ledger records money; it never moves it).

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + React + TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Postgres via Supabase (migrations, RLS, security-definer RPCs) |
| Auth | Supabase Auth (roles: `company_admin`, `cleaner`, `admin`) |
| Notifications | Web Push (VAPID) — PWA, no native apps |
| Hosting | Vercel (apps) + Supabase (database/auth) |
| Tooling | pnpm workspace monorepo |

The stack deliberately matches `../clean-app` so code and schema can migrate without a rewrite.

## Repository layout

```
clean_app_crm/
├── AGENTS.md            # operating notes for agents and contributors (imported by CLAUDE.md)
├── README.md
├── package.json         # workspace root (private; no app code at the root)
├── pnpm-workspace.yaml  # members: apps/*, packages/*
├── apps/
│   ├── crm/             # the company-admin CRM (Next.js)
│   └── cleaner/         # cleaner app — minimal parity port of ../clean-app's cleaner loop
└── packages/
    ├── db/              # Supabase schema, migrations, seed, tests, and shared types
    └── ui/              # future: shared design tokens and components
```

## Getting started

```bash
pnpm install
pnpm crm dev
```

With Docker running, `pnpm crm dev` starts or reuses the local Supabase stack, applies pending
migrations without resetting existing data, reads the local URL and publishable key, and starts
the CRM at `http://localhost:3000`. On a fresh Supabase volume, the configured demo seed is loaded
as part of initialisation.

The local seed is demo-only. The company-admin login is
`admin@clean-app.example.test` with password `local-demo-only`; it must never be used in a cloud
environment.

The CRM is run from the root with:

```bash
pnpm crm dev          # local Supabase + migrations + CRM
pnpm crm build
```

Local database (requires Docker):

```bash
pnpm crm db:start     # supabase start
pnpm crm db:reset     # apply migrations + seed
pnpm crm db:types     # regenerate TypeScript types from the schema
```

The development launcher injects the local Supabase credentials automatically. Use
`apps/crm/.env.local` only for optional local overrides (never commit `.env*`; keep
`.env.example` current).

### Invite the first company admin

Copy `apps/crm/.env.example` to `apps/crm/.env.local`. Set these server-only values:

- `CRM_PUBLIC_URL` — the CRM origin, with no locale path.
- `SUPABASE_SECRET_KEY` — the hosted Supabase secret key. The command also accepts the
  legacy `SUPABASE_SERVICE_ROLE_KEY` name.
- `FIRST_ADMIN_INVITER` — the founder name or e-mail stored in the invitation audit row.

Never expose the Supabase secret to the browser or commit `.env.local`. Run one invite:

```bash
pnpm --dir apps/crm invite:first-admin -- --email admin@example.com --locale en-AU
```

The command accepts `en-AU` or `pt-BR`. A pending invitation makes a repeated command
exit without sending another e-mail.

Configure the hosted Supabase project before a real send:

1. Add `<CRM_PUBLIC_URL>/en-AU/auth/confirm` and
   `<CRM_PUBLIC_URL>/pt-BR/auth/confirm` to the Auth redirect allow list.
2. Copy `packages/db/supabase/templates/invite.html` into the hosted **Invite user**
   e-mail template. Keep the `token_hash`, `type=invite`, and `RedirectTo` values intact.
3. Enable custom SMTP with host `smtp.resend.com`, port `465`, username `resend`, and
   the Resend API key as the SMTP password. Use a From address on a verified domain.
4. Keep the Supabase e-mail OTP expiry at one hour so it matches the application
   invitation lifetime.

Local Supabase uses the committed invite template and Inbucket. Hosted SMTP credentials
live in Supabase Auth settings, not in the application bundle.

## Status

M1 delivery is active: the workspace, fresh Supabase baseline, deterministic local seed,
company-admin auth guard, and CRM shell now live in this monorepo. The first build cycle is
specified in
`docs/design/phase-a-adoption.md` (with decisions in `docs/decisions/` and vocabulary in
`docs/glossary.md`) — a fresh monorepo-owned Supabase project (`packages/db`), `apps/crm`
(clients/sites, recurring assignments, roster, minimal dispatch) and a minimal `apps/cleaner`
(parity port of the prototype's cleaner loop with link-first pool join). Design exploration
preceded build: root `DESIGN.md` supplies the shared tokens and the approved Stitch screens are
reference material for implementation. The deterministic design-detect workflow remains disabled
until the M1 record surfaces are complete (see `AGENTS.md` § Design quality).
