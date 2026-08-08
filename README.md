# Clean App CRM

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
4. **Converge with the cleaner app.** The sibling repository
   [`../clean-app`](../clean-app) is the deployed cleaner/boss prototype
   (https://clean-app-gamma-inky.vercel.app). The intent is for this monorepo to become the single
   codebase: this CRM absorbs and extends the boss side, and the cleaner-facing app migrates in as
   `apps/cleaner`.

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
| Auth | Supabase Auth (roles: `boss`, `cleaner`, `admin`) |
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
│   ├── crm/             # the CRM (Next.js) — to be created
│   └── cleaner/         # future home of the migrated cleaner app (../clean-app)
└── packages/
    ├── db/              # future: Supabase schema, migrations, generated types shared by apps
    └── ui/              # future: shared design tokens and components
```

## Getting started

```bash
pnpm install
```

App scaffolds are not created yet; once `apps/crm` exists it will be run with:

```bash
pnpm crm dev          # alias for: pnpm --filter crm dev
pnpm crm build
```

Local database (mirrors the prototype's workflow; requires Docker):

```bash
pnpm crm db:start     # supabase start
pnpm crm db:reset     # apply migrations + seed
pnpm crm db:types     # regenerate TypeScript types from the schema
```

Environment: copy `.env.example` to `.env.local` inside the app (never commit `.env*`; keep
`.env.example` current).

## Status

Scaffold only: workspace, docs, and layout. Next step is `apps/crm` (Next.js) with the alpha data
model — `Client`, `Site`, `RecurringAssignment`, `Job` (crew size ≥ 1), `Vacancy` — extending the
prototype's schema.
