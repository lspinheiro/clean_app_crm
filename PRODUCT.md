# Product

<!-- impeccable:product-schema 1 -->

Compact product record for design work across `apps/crm` and `apps/cleaner`. Strategy,
features (F1–F14), journeys (CA-*/CL-*/OP-*), and release stages live in
`docs/PRODUCT.md` (canonical in this repository since v0.4; the former `personal_website`
sync is retired); vocabulary in `docs/glossary.md`; build-cycle scope in `docs/design/`.
When this file and `docs/PRODUCT.md` disagree, `docs/PRODUCT.md` wins and this file gets
fixed.

## Platform

web

## Stack

Fixed (AGENTS.md): Next.js App Router + React + TypeScript, Tailwind CSS v4, Supabase
(Postgres, auth, RLS, security-definer RPCs), Vercel, pnpm workspace monorepo. Cleaner
surface is a wrapper-ready PWA with Web Push — no separate native codebase in v1; store
distribution, if evidence demands it, wraps the web app (decision 0004).

## Users

- **Thiago — company admin.** Co-owner/supervisor of a Gold Coast commercial cleaning
  company (~12 cleaners). Runs the business from his phone between site visits; WhatsApp
  power user; roster lives in his head and a spreadsheet; sceptical of software. A tool
  must be faster than what he does today or he stops using it.
- **Ana — pool cleaner.** International student on a part-time visa, cleans for 2–3
  companies, phone-only, English is her second language. Fears unpaid work and wasted
  travel; installs nothing that does not visibly lead to work.
- **Priya — newcomer candidate.** Recently arrived, searching WhatsApp/Facebook job
  groups, needs income this week; wary of long forms before seeing a real job. (Enters at
  MVP via share links; not an alpha user.)
- **Ops teammate — internal.** Concierge onboarding, vetting ops, dispute moderation.

## Product Purpose

Free system of record for commercial cleaning operations: clients, sites, recurring
assignments, rosters — and the pool/dispatch loop that keeps the schedule staffed. Success
(north star): completed jobs run through the platform per week. Current stage: internal
alpha — two partner companies from the founding team's network running real weeks in-app.
**The alpha is validated by the partner companies' experience**: qualitative feedback
collected to support design — never analytics. There are no alpha exit criteria (product
decision 2026-08-10; applied in `docs/PRODUCT.md` v0.4 §3.4).

## Positioning

"Become the system of record for cleaning jobs." Once the schedule lives in the product,
every outbound action (pool offer, push, WhatsApp post, recruitment notice) derives from a
vacancy the schedule already fully specifies — competitors bolt messaging onto a job
board; here distribution is a consumer of the schedule. The core is permanently free;
monetisation is a later paid tier of admin automation on top, so the free product never
degrades to upsell.

## Operating Context

Gold Coast QLD commercial cleaning SMEs. Today the work runs on WhatsApp groups, Facebook
job groups, spreadsheets, and end-of-day phone-arounds; job flow often arrives via
property managers (Breezeway). Admins operate one-handed on phones between site visits;
cleaners are phone-only, often multilingual, juggling study timetables across multiple
employers' pools. Dropout hours before a deadline job is the sharpest loss event —
backfill speed is the hero moment. UI in English; currency AUD; timezone
`Australia/Brisbane`.

## Capabilities and Constraints

- Alpha scope is `docs/design/phase-a-adoption.md`: CA-1/CL-1/OP-1 designed end-to-end;
  the prototype's cleaner loop and minimal dispatch re-housed at parity. Dropout flow,
  availability, outcomes, reviews, vetting, share links, messaging, AI, WhatsApp
  automation: all later cycles — do not design ahead of stage.
- Product law (AGENTS.md): no money movement (the ledger records, never transfers; no
  candidate-side payment surface, ever); reviews structured-only, never free text about
  people; vacancy is the connecting object all distribution consumes; jobs carry crew
  size ≥ 1 with per-slot assignment; agent autonomy enforced server-side per capability.
- Privacy boundaries: site address and access notes are assignment-gated and access-
  logged; cleaners never see client phone, client charge, or internal notes; vetting
  outcomes are status + expiry only.
- The `../clean-app` prototype is reference, not runtime or authority; where its UI/UX
  and `docs/PRODUCT.md` disagree, PRODUCT.md wins. Never the word "boss" — say company
  admin.
- Free-tier discipline: lean payloads, push over e-mail, small bundles.
- Terminology is binding: `docs/glossary.md` (client, site, job, crew slot, vacancy,
  recurring assignment, company admin).

## Brand Commitments

- Working name **"The Clean Crew"** appears in alpha UI; final naming is an open decision
  (docs/PRODUCT.md Appendix B q7) — a later rebrand is expected, design accordingly.
- Parity screens in `apps/cleaner` keep visual fidelity to the `../clean-app` prototype
  (design-doc decision); new screens go through design exploration.

## Evidence on Hand

- Deployed prototype (https://clean-app-gamma-inky.vercel.app) and its local source as
  reference; working board, job cards, money screen, push.
- Discovery: interview with Thiago, founder voice notes, deep-research report — private,
  summarised in `docs/PRODUCT.md` Appendix A. Citable sector stats: 76% of hotels
  reported staffing shortages (AHLA, May 2024); ~40% of 554 surveyed hosts/property
  managers struggled to find dependable cleaners (2025).
- **No** testimonials, case studies, customer logos, or usage metrics exist yet — never
  fabricate them. Seed data is demo-only and must be clearly marked demo. Design-partner
  arrangement with Thiago's company is pending (Appendix B q9).

## Product Principles

1. **The schedule is the source of truth.** Every outbound action derives from a vacancy;
   no feature asks anyone to re-describe work the schedule already knows.
2. **Faster than the group chat, or he reverts.** Every admin flow competes with typing a
   WhatsApp message; every cleaner flow competes with replying to one.
3. **Signal, not noise.** Admins see rosters, queues, and digests — never raw threads.
4. **Trust through structure.** Badges, structured reviews, a ledger both sides can see;
   never free-text judgements of people, never moving money.
5. **The phone is the venue.** Cleaner flows survive interruption, never require an
   install to start, and treat push as the primary channel.

## Accessibility & Inclusion

WCAG 2.2 AA is the target for both apps. Plain-English copy rule for cleaner-facing
surfaces: short sentences, no idioms, numerals for times and pay (ESL, phone-only user
base). Touch-first sizing, visible focus states, and reduced-motion respect from the
first screen — retrofitting AA is what makes it expensive.
