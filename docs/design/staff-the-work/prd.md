# Staff the work, both routes — PRD

## Project specifics

- **Status:** draft
- **Stage:** alpha (PRODUCT.md §3.4)
- **Journeys:** [CA-3](../../PRODUCT.md#phase-c--staff-the-work-vacancy--assigned) (fill a
  vacancy from the pool), CA-4 (assign a known cleaner directly), CL-2 (find work on the
  board)
- **Features:** F10 (jobs and roster), F11 (cleaner app), F5 (matching signals — only the
  applicant list order already delivered; no new F5 work)
- **Participants:** Leonardo (product owner, `apps/crm` track), Dotto (`apps/cleaner`
  track)
- **Project:** — (added by `to-features`)
- **Design reference:**
  [approved queue-first application review](../../../.impeccable/mocks/application-approval-a-queue-first.png)
- **Date:** 2026-08-24

## Goals and business objectives

Deliver the staffing loop end to end: a company admin can fill a vacancy through both
routes — post it to the board and assign from applicants (CA-3), or send a direct offer
that the cleaner accepts in one tap (CA-4) — and a cleaner can find and take work on the
board (CL-2). At the end of the cycle the test cohort can staff real jobs through the app
instead of the group chat.

This cycle also closes the consent gap in recurring generation: a named cleaner on a
recurring assignment gets one series offer, and instances generate assigned only under
that standing consent (Phase A HLD decision 9).

## Background and strategic fit

The Phase A cycle delivered the platform base: accounts, onboarding, clients and sites,
recurring assignments and generation, one-off jobs with crew slots, the roster, cleaner
invitations and join, the Cleaner board with one-tap apply and withdraw, passive applicants
on CRM job detail, per-slot assignment, and the pay ledger. It did not make a new application
visible on the Jobs list or in a CRM notification, and the job-detail applicant list did not
provide an explicit review workflow. See the
[Phase A gap map](../phase-a-adoption/lld.md).

This cycle was selected by delivered-baseline independence, not by roadmap phase order
(decision #1): each journey in scope depends only on delivered code, so both app tracks
start in parallel. CA-3, CA-4, and CL-2 together are the smallest set that makes staffing
testable as one loop; CL-2 makes CA-3 possible (applications must exist before an admin
can assign from them), and CA-4 is self-contained new work (the offers entity and its
surfaces).

## Assumptions

- The delivered contracts in `cle_49` (`cleaner_job_board`, `apply_to_job`,
  `withdraw_application`, `assign_job_slot`, `post_job`) are the base for CL-2 and CA-3;
  this cycle wires surfaces to them and changes them only where a story requires it.
- The offers entity is new `packages/db` work inside this cycle. Its design authority is
  the Phase A HLD (decisions 9, 10, 14): offers are an entity; "offered" and "vacancy"
  stay projections, never stored job statuses.
- An ordinary board application creates a durable in-app CRM notification for each active
  company employee and a live awaiting-review count. It does not send web push to company
  employees. Push remains for time-sensitive vacancy distribution and directed offers.

## User stories

### CA-3 / CL-2 — Review and resolve a board application

1. Ana applies to a posted job from the Cleaner board. The application records interest
   and consent; it does not reserve a crew slot or close the vacancy.
2. Thiago sees the awaiting-review count on the Jobs list and an unread CRM notification
   linked to the job's Applications section, without manually refreshing the page.
3. Job detail leads with an application queue in persistent job and crew context. Preferred
   cleaners remain first. Thiago selects an open crew slot and approves an applicant.
4. Approval assigns the selected slot immediately. There is no second cleaner acceptance,
   because the board application already expressed consent.
5. Thiago may instead mark an application **Not selected**, without recording a free-text
   reason. He may restore it to awaiting review while the job remains posted with an open
   slot. Assigned, withdrawn, closed, and cancelled states cannot be restored.
6. When the final slot is filled, the existing job-resolution rule marks every remaining
   awaiting application **Not selected** so no cleaner remains silently waiting.

## User interaction and design

The approved direction is the
[queue-first application review](../../../.impeccable/mocks/application-approval-a-queue-first.png)
in the established Trust Blue CRM world.

- The job header keeps site, service, schedule, status, and crew progress visible while the
  admin reviews applications.
- Awaiting applications are the primary work queue. One applicant expands at a time into
  the slot choice and the single primary action, **Approve for slot {n}**.
- The approval control states that approval assigns immediately; no offer or second Cleaner
  confirmation is implied.
- **Not selected** is a secondary action with no reason field. Resolved responses stay
  available below the active queue and a valid not-selected response exposes **Restore**.
- Crew progress remains visible beside or immediately after the queue. Directly giving work
  to a non-applicant stays visually separate because that route requires an offer and is not
  an application approval.
- Desktop and mobile use the same reading order and 44 px minimum controls. Both `en-AU`
  and `pt-BR` carry complete copy.

## Open questions

| Question | Owner | Answer |
|---|---|---|
| Is web push required for directed offers and their responses in this cycle? | Leonardo | —. Ordinary board applications are explicitly in-app CRM only. |

## What we're not doing

**Not now (later cycles):**

- CL-3 (work an assigned job), CL-12 (weekly agenda) — the delivered `cleaner_my_jobs`
  contract stays screenless this cycle.
- CL-5 availability toggle and job-type preferences — board and applicant ordering by
  preference and availability (the v0.4 additions to CL-2/CA-3) wait for it.
- CA-5 (run the day), CA-6 (dropout recovery), CL-6 (urgent jobs) — they need CL-3 status
  taps first.
- Phase A tail items that do not block this cycle: pay basis pair, Cleaner Money screen,
  Cleaner profile, PWA install prompt, `product_events`.

**Not ever (in this cycle's ground):**

- No automatic offer cascade (F13 — MVP), no share packs (F12 — MVP), no vetting badges or
  ranking (F4/F6 — MVP). Stage discipline per PRODUCT.md §3.4.

## Decision log

### 1. Cycle scope is CA-3 + CA-4 + CL-2, selected out of phase order (2026-08-24)

The roadmap phases (PRODUCT.md §3.2) group journeys by job lifecycle, but the cycle was
selected by a different rule: whole journeys that are testable end to end and depend only
on delivered code, so the two app tracks can start in parallel. Phase A keeps its remaining
tail under its own documents — this cycle does not absorb it. Considered options: absorb the
Phase A tail into this cycle (rejected — the Phase A documents stay the design authority for
their gap map); deliver Phase B before Phase C (rejected — Phase B's alpha journeys are thin
and the staffing loop is the higher-value testable unit).

### 2. Application approval is immediate assignment with an explicit response queue (2026-08-25)

A board application is already the cleaner's consent, so approval assigns the chosen crew
slot immediately and never creates an offer. Ordinary applications surface through a live
Jobs count and durable CRM notification, not admin push. The admin can explicitly resolve an
application as **Not selected** without free text and restore it only while the job is still
open. Considered option: require a second Cleaner acceptance after approval — rejected because
it repeats consent and contradicts Phase A decision 11. Considered option: remove unresolved
applications from view — rejected because CL-2 requires visible, quick resolution.
