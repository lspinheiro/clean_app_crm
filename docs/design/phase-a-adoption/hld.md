# Phase A — company onboarding and pool adoption (alpha) — HLD

## Overview

This design delivers the [Phase A PRD](prd.md) on the monorepo: a fresh Supabase project
owned by `packages/db`, a company-admin CRM (`apps/crm`), and a minimal cleaner PWA
(`apps/cleaner`). The deployed prototype (`../clean-app`) supplied reference mechanics and
visual fidelity targets; it never runs against the alpha database
([ADR 0002](../../decisions/0002-alpha-runs-on-monorepo-apps-only.md)).

Split from the original single Phase A document on 2026-08-15; the decisions below are
from the 2026-08-08 grilling session unless dated otherwise.

## Current state

The delivered system on `origin/main` (2026-08-15) is a partial build of this design. It
is work in progress: where it deviates from the PRD, this design wins and the code
changes. Delivered:

- Foundation tables, company identity, clients/sites with defaults and preferred
  cleaners, and the `service_catalogue` (platform-owned, seeded — already aligned with
  PRD decision #7).
- Recurring assignments with generation (pg_cron pattern, 28-day horizon, idempotent).
  Named cleaners are auto-assigned with no acceptance step — the superseded decision #1
  behaviour; PRD decision #11 (offers) is not yet built.
- Jobs, crew slots, applications (`applied`/`assigned`/`not_selected`/`withdrawn`), the
  `vacancies` view, and the cleaner views (`cleaner_job_board`, `cleaner_my_jobs`) with
  the audited address RPC.
- Pool invite: one active 6-character code per company with rotate-in-place — the model
  PRD decision #8 rejected. No registration cap, no per-link attribution, no offer
  details on the link.
- Cleaner join: email + password only through `join_company_pool`; no Google OAuth
  (PRD decision #9 not yet built).
- Pay: a single `cleaner_pay_cents` amount per slot on sites, recurring assignments, and
  jobs — no pay basis (PRD decision #10 not yet built).
- Notifications are rows in a `notifications` table only; web-push, `product_events`
  (S26), and bulk CSV import (S30) are absent.

At the 2026-08-08 session the repo was scaffold-only; the prototype findings that shaped
the first design round (schema-only `job_series`, merged client/site rows, single-cleaner
assignment, code-entry join) are kept in the decision log context.

## Proposed architecture

```mermaid
flowchart LR
    subgraph appsGroup["Monorepo apps"]
        CRM["apps/crm\nNext.js SSR dashboard"]
        CLEANER["apps/cleaner\nclient-first PWA"]
    end
    subgraph db["packages/db — Supabase project"]
        RPC["Security-definer RPCs\n(all flow mutations)"]
        VIEWS["Cleaner views\n+ vacancy view"]
        PG[("Postgres\nRLS + explicit grants")]
        CRON["pg_cron nightly generation\nAustralia/Brisbane"]
        PUSH["Web-push dispatch\n(VAPID)"]
    end
    RESEND["Resend Batch API\none-time workforce invitation"]
    CRM -->|"server actions"| RPC
    CRM -->|"company-scoped reads"| PG
    CRM -->|"server-only e-mail batches"| RESEND
    CLEANER -->|"client Supabase SDK, PKCE auth"| VIEWS
    CLEANER -->|"mutations"| RPC
    RPC --> PG
    VIEWS --> PG
    CRON --> PG
    PG --> PUSH
    PUSH -.->|"push notifications"| CLEANER
```

Component responsibilities:

- **`packages/db`** — owns the canonical schema, migrations, RLS policies, grants, RPCs,
  views, and the generation job. Seeded by adaptation of the prototype's migrations, then
  evolved freely ([ADR 0001](../../decisions/0001-alpha-database-fresh-supabase-project.md)).
- **`apps/crm`** — the company-admin dashboard (Next.js, SSR): roster, clients/sites,
  recurring assignments, pool, company settings, minimal dispatch, and the bulk CSV
  import (S30): the browser parses and validates the file against the published column
  format, shows a preview with per-row errors, and submits confirmed rows through the
  same server actions and RPCs as one-by-one entry. Reads are company-scoped;
  state-changing mutations go through RPCs. The Pool route also parses a cleaner CSV
  in the browser, previews the one-time invitation, and submits a confirmed send list
  to a server-only Resend adapter. The adapter never exposes its API key to the browser.
- **Resend** — the alpha provider for one-time workforce invitation e-mails. The CRM
  sends no more than 100 messages per provider batch. Stable idempotency keys prevent a
  repeated confirmation from sending a second copy.
- **Locale presentation** — both apps share the `en-AU`/`pt-BR` locale contract and the
  per-profile preference. The CRM uses canonical locale-prefixed routes, complete
  app-owned catalogues, device-language negotiation before sign-in, and explicit
  selection on sign-in and in settings. Locale changes presentation only: AUD,
  `Australia/Brisbane`, stored values, and user-authored content remain unchanged.
- **`apps/cleaner`** — the cleaner surface: client-first and static-exportable, so a
  Capacitor store shell stays a bolt-on if alpha iOS push evidence demands it
  ([ADR 0004](../../decisions/0004-cleaner-surface-wrapper-ready-pwa.md)). Client Supabase
  SDK against the cleaner views/RPCs, PKCE client auth (not the SSR cookie pattern), push
  registration behind one abstraction module, app-shell offline caching via the service
  worker. Cleaner credential (PRD decision #9): Supabase Auth with the Google OAuth
  provider and email + password; a client-side PKCE callback route completes OAuth and
  stays compatible with static export. The join screen owns webview detection: inside an
  in-app browser it steers Google users to the system browser (the invite context
  travels in the URL) and always offers email + password; expired, revoked, or
  limit-reached links show the "invite no longer active" state.
- **Recurrence generation** — nightly pg_cron run in `Australia/Brisbane`, plus immediate
  generation on create/edit.
- **Web-push infrastructure** — VAPID keys, service worker, dispatch route (pattern ported
  from the prototype).

## Data flow

- Admin writes enter through `apps/crm` server actions, which call security-definer RPCs;
  reads are company-scoped selects under RLS.
- Cleaners read only through dedicated views and mutate only through RPCs — never direct
  selects on company tables. The assignment-gated address/access-notes boundary keys on
  the cleaner's slot assignment.
- The generation job materialises job instances from recurring assignments: 28-day
  horizon; idempotent per (assignment, service date). Edits regenerate future instances
  that are still untouched; started, completed, or manually edited instances are never
  touched. Instances of an **accepted** series with a named cleaner are created already
  assigned — the series acceptance is standing consent, and the generation job only
  reads the consent mark. Instances of a series the named cleaner has not accepted show
  as **offered** — not assigned, not on the board. Instances with no named cleaner are
  created as `posted` — these are the vacancies the board and roster consume, via the
  vacancy view ([ADR 0003](../../decisions/0003-vacancy-as-projection.md)).
- Directed offers (S28/S29) are one entity with two target kinds — a job or a recurring
  assignment — and one lifecycle: pending → accepted / declined / revoked. Offer
  mutations are RPCs. Acceptance of a job offer completes the slot assignment;
  acceptance of a series offer writes the consent mark on the named-cleaner link, which
  the generation job consumes. A slot with a pending offer is not a vacancy: the board
  and vacancy view exclude it. "Offered" is a projection, not a stored status — a slot is
  offered exactly while a pending offer targets it, the same way a vacancy is a
  projection of an unfilled slot. The cleaner reads pending offers from one in-app
  surface backed by this entity. A decline notifies the admin and ends the pending
  offer, so the projection makes the slot a vacancy on the board immediately; the admin
  can direct a new offer at any time, which takes it off the board again (decision 14).
- Invite links (S8) are self-contained outreach records: many links per company, each
  carrying admin-authored offer details — a title/description and a pay shape (hourly
  rate or fixed amount, with its value) stated at creation — plus optional expiry,
  optional maximum registrations, and revocation. The pre-registration preview renders
  from the link itself; a link references no job record, and registration through it
  produces pool membership only. Each registration attributes to the link that admitted
  it, and the CRM pool screen shows per-link state (active / expired / revoked / limit
  reached) and registration count. The delivered one-active-code-with-rotation model
  (`rotate_company_invite`) gives way to this multi-link model.
- Cleaner CSV invitations (S8/S30) use one selected active invite. The browser parses,
  validates, normalises, and deduplicates `email` plus optional `name`. It shows the
  exact count and localised copy before confirmation. A server action re-authorises the
  company admin, resolves the active invite, creates company-scoped batch state through
  RPCs, and calls Resend in chunks of at most 100, with at most 500 unique recipients in
  one confirmed alpha send. The provider result updates each recipient to accepted or
  failed. An explicit retry selects failed recipients only. No step creates a Supabase
  Auth user or a pool membership.
- Pay flows as a (basis, value) pair: fixed amount per slot, or hourly rate. Site
  defaults seed the pair; recurring assignments carry it; generated jobs inherit it;
  one-off jobs prefill it from the site default. Every surface shows pay as the admin
  stated it. No surface computes a total. For an hourly job, the admin states the
  settled amount at mark-paid; that amount is what `ledger_entries` records.
- Only manually posted jobs trigger pool push notifications (PRD decision log #2);
  generated instances and auto-assignments are silent in this cycle.
- Instrumentation events land in `product_events` at each funnel step (PRD S26).

The critical path across components — a directed series offer:

```mermaid
sequenceDiagram
    participant CRM as apps/crm
    participant RPC as offer RPCs
    participant PG as Postgres
    participant PUSH as web-push
    participant CL as apps/cleaner
    CRM->>RPC: offer series to cleaner
    RPC->>PG: insert pending offer
    PG->>PUSH: notify offered cleaner
    PUSH-->>CL: push: new offer
    Note over PG: generation creates instances as offered (off the board)
    CL->>RPC: accept
    RPC->>PG: offer accepted + consent mark on named-cleaner link
    Note over PG: generation now creates instances already assigned
    RPC-->>CRM: roster shows assigned
```

### Data model outline (first migration set)

Entity-level outline; table detail belongs to migrations (no LLD exists for this cycle).

`companies` (+ ABN), `profiles` (role enum `company_admin`/`cleaner`/`admin`),
`company_members` (each membership attributes to its admitting invite),
`company_invites` (multi-link: admin-authored offer details, pay shape, optional expiry
and registration cap, revocation), `clients`, `sites` (address, access notes, defaults,
ordered preferred cleaners), `service_catalogue` (platform-owned, seeded), `recurring_assignments` (one row per weekday,
weekly/fortnightly, `crew_size`, pay basis + value; named cleaners in a side table filled
in slot order at generation), `jobs` (site FK, `crew_size`, pay basis + value), `job_assignments` (per-slot; cleaner-overlap
exclusion; assignment history timestamps), `job_applications`, `offers` (one row per
directed offer; target is a job or a recurring assignment; lifecycle state; the accepted
series offer projects a consent mark onto the named-cleaner link), `ledger_entries` (one per
job + cleaner — per slot, not per job; the amount is always admin-stated — at creation
for fixed jobs, at mark-paid for hourly jobs), `notifications` + web-push infrastructure,
`product_events`, `pool_invite_email_batches` + `pool_invite_email_recipients` (submission
state only), and the vacancy view.

## Requirement mapping

| PRD stories | Components |
|---|---|
| S1 (company + ABN) | `apps/crm` settings, `packages/db` `companies` |
| S2–S4 (clients, sites, defaults, preferred cleaners) | `apps/crm` clients, `packages/db` `clients`/`sites` |
| S5 (recurring assignments) | `apps/crm`, `packages/db` `recurring_assignments` + named-cleaner side table |
| S6 (generated instances: consent-gated assignment, offered, posted vacancies) | generation job (pg_cron + on-edit, reads series consent), `offers`, vacancy view |
| S7 (roster week view) | `apps/crm` roster, vacancy view |
| S8 (pool invite link with offer details, limits, revocation, and confirmed delivery) | `apps/crm` pool, server-only Resend adapter, `packages/db` `company_invites` + company-scoped e-mail batch state |
| S9–S12 (link-first join, auto pool join, PWA + push opt-in, board) | `apps/cleaner` join + board, cleaner views, RPCs |
| S27 (cleaner sign-in: Google OAuth / email + password) | Supabase Auth (Google provider + email/password, PKCE callback route in `apps/cleaner`) |
| S28–S29 (directed offers with accept/decline) | `offers` entity + offer RPCs, `apps/crm` job detail + recurring assignment, `apps/cleaner` offers surface, generation job (consent-gated), notifications |
| S30 (bulk CSV for company data and cleaner send lists) | `apps/crm` client-side parse + preview; existing write RPCs for company data; Resend adapter and batch RPCs for cleaner invitations |
| S31 (CRM jobs list) | `apps/crm` jobs |
| S16 (board apply/withdraw) | `apps/cleaner` board, `job_applications` RPCs |
| S17–S18 (my jobs, gated address, status taps) | `apps/cleaner`, cleaner views, assignment-gated boundary |
| S19, S24 (money views, mark-paid) | `apps/cleaner` money, `apps/crm` money, `ledger_entries`, mark-paid RPC (amount stated for hourly jobs) |
| S20 (push delivery) | web-push infrastructure, push abstraction module |
| S21 (profile with pools) | `apps/cleaner`, cleaner views |
| S22–S23, S25 (job detail + per-slot assign, one-off creation, cancel) | `apps/crm` jobs, `create_one_off_job`/`assign_job_slot`/`cancel_job` RPCs |
| S26 (instrumentation) | `product_events` writes from both apps and RPCs |

## Non-functional requirements

- **Security and product law** (root `AGENTS.md`): every table gets explicit grants to
  `authenticated` and `service_role` (missing grants surface as silent 42501 failures) and
  company-scoped RLS for company admins. Cleaners never see client phone, client charge,
  or internal notes. The pay ledger records and never moves money. No candidate-side
  payment surface and no free-text review surface exists. Vacancy remains the connecting
  object: the view is the only gap interface the roster and board consume.
- **Privacy**: site address and access notes are revealed only to the assigned cleaner,
  keyed on the slot assignment.
- **Reliability of generation**: idempotent per (assignment, service date); safe to re-run.
- **Free-tier discipline**: select only needed columns; push over e-mail; small payloads.
- **Timezone**: all schedule computation in `Australia/Brisbane`.
- **E-mail boundary**: `RESEND_API_KEY` and the verified sender address are server-only.
  The RFC-quoted sender display name is "{company name} via The Clean Crew". Reply-To
  uses the authenticated admin e-mail. Stored provider failures contain no credentials
  or raw provider internals.

## Open questions

- Generation horizon (28 days) and the notification discipline are to be sanity-checked
  against the founders' week-one feedback.
- No LLD exists for this cycle; migrations and tests are the table-level authority.
- PRD decisions #7–#12 (2026-08-15) are all absorbed: the service-type catalogue (#7,
  delivered aligned — see Current state), invite links (#8, decision 11), the cleaner
  credential (#9, written into the `apps/cleaner` component — the PRD decision fixed
  the trade-offs), the pay basis (#10, decision 12), the directed-offer flow (#11,
  decisions 9–10), and the bulk CSV import replacing seed tooling (#12, decision 13).

## Decision log

The standalone ADRs 0001–0004 predate this document and are frozen in `docs/decisions/`;
entries 1–4 summarise them for this cycle's context.

### 1. Fresh Supabase project; `packages/db` owns the schema (2026-08-08)

[ADR 0001](../../decisions/0001-alpha-database-fresh-supabase-project.md): the alpha runs
on a fresh Supabase project. `packages/db` owns the canonical schema, seeded by adaptation
of the prototype's migrations, then evolved freely.

### 2. The alpha runs on monorepo apps only (2026-08-08)

[ADR 0002](../../decisions/0002-alpha-runs-on-monorepo-apps-only.md): `apps/crm` plus a
minimal `apps/cleaner`; the prototype never runs against the alpha database. This
mid-session pivot dissolved the compatibility constraints earlier decisions had worked
around.

### 3. Vacancy is a view, not a table (2026-08-08)

[ADR 0003](../../decisions/0003-vacancy-as-projection.md): vacancy is a projection over
unfilled crew slots. The roster and the board consume the same view; no separate vacancy
persistence object exists.

### 4. `apps/cleaner` is a wrapper-ready PWA (2026-08-12)

[ADR 0004](../../decisions/0004-cleaner-surface-wrapper-ready-pwa.md): client-first and
static-exportable, so a Capacitor store shell stays a bolt-on if alpha iOS push evidence
demands it. Acquisition always stays web.

### 5. Clients and sites are separate tables; jobs reference the site (2026-08-08)

Clean vocabulary from the first migration: `clients` (the commercial party) and `sites`
(address, access notes, defaults) as separate tables, with jobs FK to the site. This
splits the prototype's merged client/site rows before any data exists.

### 6. Crew slots and a per-slot ledger from day one (2026-08-08)

`jobs.crew_size ≥ 1` plus a per-slot `job_assignments` table (product law, `AGENTS.md`).
The cleaner-overlap exclusion and the pay ledger key on (job, cleaner) — one ledger entry
per slot, not per job. Admin assignment from applicants stays admin-picks;
first-accept-wins enters with the cascade (cycle 2).

### 7. Recurring assignment shape: one row per weekday (2026-08-08)

Weekly/fortnightly; "Mon/Wed/Fri" is three rows. `crew_size` on the assignment; named
cleaners in a side table, filled in slot order at generation.

### 8. Generation mechanics (2026-08-08)

Nightly pg_cron in `Australia/Brisbane` plus immediate generation on create/edit; 28-day
horizon; idempotent per (assignment, service date). Edits regenerate only future,
untouched instances. Instances with no named cleaner generate as `posted` — they are the
vacancies on the board.

### 9. Offers are one entity with two target kinds (2026-08-15)

Delivers PRD decision #11. One `offers` entity covers both directed-offer shapes: the
target is a job or a recurring assignment, with one lifecycle (pending → accepted /
declined / revoked). Acceptance of a series offer writes a consent mark on the
named-cleaner link; the generation job is a pure reader of that mark — consented
instances generate assigned, unconsented instances generate as offered. A slot with a
pending offer is excluded from the vacancy view and the board. Considered option: a
separate mechanism per shape (offer records for jobs, a bare consent flag for series) —
rejected because the cleaner's pending-offers surface, the notification hook, and the
decline history would each need two sources. The delivered generation RPC auto-assigns
named cleaners without consent; it changes to consent-gated.

### 10. "Offered" is a projection, not a stored status (2026-08-15)

The job status model gains no `offered` value. A slot is offered exactly while a pending
offer targets it; the roster and the board derive the state from the `offers` entity.
This extends vacancy-as-projection ([ADR 0003](../../decisions/0003-vacancy-as-projection.md))
and removes a class of drift: an offer transition cannot leave a stale status behind,
because the state is the offer row. Trade-off accepted: roster and board queries join
against pending offers — the same join the board needs anyway to exclude offered slots.

### 11. Invite links are self-contained outreach records (2026-08-15)

Delivers PRD decision #8. `company_invites` becomes a multi-link table: each link
carries admin-authored offer details — title/description and a pay shape with its
value — plus optional expiry, an optional registration cap, and revocation; each
registration attributes to its admitting link. A link references no job or recurring
assignment: the preview renders from the link itself, and registration produces pool
membership only. Considered option: the link references a job record so the preview is
always current — rejected because an edited or deleted job would silently change or
break sent links, and a job-referencing link reads as an application to that job, which
contradicts the settled boundary (link → pool membership; assignment is a directed
offer or a board application). The delivered one-active-code-with-rotation model is
replaced.

### 12. The ledger records admin-stated amounts only (2026-08-15)

Delivers PRD decision #10 at the ledger. Pay travels as a (basis, value) pair — fixed
amount per slot, or hourly rate — from site defaults through recurring assignments to
jobs. No surface computes a pay total. A fixed job's ledger amount is set at creation.
An hourly job's ledger row shows the rate until settlement; the admin states the
settled amount at mark-paid, and the ledger records that amount. Considered option: an
estimate of rate × duration shown before settlement — rejected because a computed
number the admin did not state reads as a promise, and flexible hourly work makes it
wrong in both directions. The delivered single `cleaner_pay_cents` model gains the pay
basis.

### 13. Bulk import parses in the browser and reuses the write RPCs (2026-08-15)

Delivers PRD decision #12 (S30). The CRM parses and validates the CSV client-side
against the published column format, shows a preview with per-row errors, and submits
confirmed rows through the same server actions and RPCs as one-by-one entry; duplicate
re-imports are rejected per row. Considered option: a server-side import RPC that
inserts the batch in one transaction — rejected because it creates a second write path
with security-definer insert rights to defend, and its all-or-nothing failure mode is
worse for the admin than per-row results. Cost of many small calls is irrelevant at
alpha scale. No seed or concierge tooling exists.

### 14. A declined slot becomes a vacancy immediately (2026-08-15)

Found by the validation walk. When a cleaner declines an offer, the pending offer ends,
and the projection (decision 10) makes the slot a vacancy on the board with no admin
action. The decline notification tells the admin, who can direct a new offer at any
time — a new pending offer takes the slot off the board again. Considered option: hold
the declined slot off the board until the admin acts — rejected because it needs a
third state and hides unfilled work from every cleaner while the admin is away; the
vacancy model exists to make gaps visible. Refines the PRD's S29 wording (PRD decision
log #13).

### 15. Locale is a presentation and profile concern (2026-08-17)

F15 uses canonical `en-AU` and `pt-BR` URL prefixes plus a nullable profile preference.
An explicit URL controls the current rendering; the saved profile choice controls later
visits and sign-ins; device language is only the pre-auth fallback. This keeps links
deterministic and gives both roles one preference contract without making language a
company property. The app name remains `The Clean Crew` in both locales.

### 16. Resend delivers confirmed one-time workforce invitations (2026-08-17)

Resend is the alpha provider for cleaner send lists. The browser owns CSV validation and
preview, while the CRM server re-authorises the admin, persists company-scoped submission
state through RPCs, derives the logical confirmation key from the selected invite, locale,
and normalised recipient e-mails, and sends provider batches of at most 100 messages. One
confirmed alpha send is limited to 500 unique recipients. Each provider batch has a stable
idempotency key. The alternative, Supabase Auth invitations, was rejected because the CSV
is a contact list for the existing link-first registration flow, not an account import.
