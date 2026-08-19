# CLE-24 — My jobs: gated address, status taps, job done

Design for the cleaner-app surface where an assigned cleaner works the job.
Milestone M3, "A cleaner joins and a job runs end to end". Cleaner-app UI only:
every rule this screen enforces is already enforced in the database by CLE-49.

## Why this issue exists

M3 today stops halfway. She joins a pool (CLE-19), sees the board (CLE-20) and
applies (CLE-21). Once a company admin assigns her, no screen exists. This is the
work actually happening — and it is the surface that carries the product's
sharpest privacy promise: a site's full address and access notes appear only
after assignment, and every look at them is logged.

Journey reference: `docs/PRODUCT.md` CL-2 onward.

## What the database already provides

Verified against `packages/db/supabase/migrations/20260811130000_cle_49_loop_foundations.sql`.
No migration is needed for this issue.

**`cleaner_job_board` is not involved.** This screen reads `cleaner_my_jobs`:

```
assignment_id, job_id, slot_number, company_id, company_name, company_logo_path,
site_name, suburb, service_id, service_name, status, scheduled_start,
duration_minutes, cleaner_pay_cents, assigned_at
```

filtered to her own active assignments, at approved companies, with
`job.status in ('draft','posted','assigned','on_the_way','in_progress')`.

Three consequences the UI inherits and must not re-implement:

1. **The view carries no address and no access notes.** They are unreachable from
   this query at all, so the screen cannot leak them by accident.
2. **`completed` and `cancelled` are filtered out.** The acceptance criterion
   "job-done moves the job off the active list" is satisfied by the view; the UI
   only has to re-read after the mutation.
3. **`draft` and `posted` are included.** A crew-2 job only becomes `assigned`
   when every slot fills (`assign_job_slot`: `if active_assignment_count =
   target_job.crew_size`). So a card can exist for a job she is committed to but
   cannot start. See "The waiting state" below.

**`get_cleaner_job_access(target_job_id uuid) returns table (address text,
access_notes text)`** — security definer; requires an active assignment on a
live job at an approved company; raises `insufficient_privilege` with message
`Job access is unavailable` otherwise. It is `volatile` because **every
successful call inserts a `site_access_log` row** (job, site, assignment,
cleaner, timestamp).

**`update_job_status(target_job_id uuid, target_new_status public.job_status)`** —
security definer; requires an active assignment; permits exactly three
transitions and raises `check_violation` with `Invalid job status transition` for
anything else, or `insufficient_privilege` with `Assigned cleaner access
required` when she is not on the job.

## Decisions taken

Four questions were settled in the session that produced this document; each
changed the design rather than merely confirming it.

### Address and access notes reveal on an explicit tap

The card shows site name and suburb only. A **Show address** control fetches and
reveals the address, access notes and the maps handoff.

The reason is the audit log, not screen real estate. Because
`get_cleaner_job_access` writes a `site_access_log` row per call, fetching
eagerly for every card on every page load would make the log a record of app
launches rather than of address lookups. `AGENTS.md` requires site addresses to
be "assignment-gated and access-logged" — a log that cannot distinguish a
deliberate look from a background render does not satisfy the second half.

Cost accepted: one extra tap for a cleaner about to travel.

### The waiting state — disabled control with a stated reason

When her job is `draft` or `posted`, the card stays in the list, the status
control renders disabled, and a line above it says why. This mirrors the idiom
CLE-21 established for a withdrawn application: the surface stays honest by
explaining a shut control rather than offering one that fails on tap.

Hiding these jobs was rejected: she has committed to the work and needs to see
that she is rostered. A separate list section was rejected as premature
structure for a screen that will hold very few jobs.

### Navigation — a two-tab bar in the cleaner layout

`(cleaner)/layout.tsx` gains a tab bar with **Board** and **My jobs**. Nothing in
CLE-24's acceptance criteria mentions navigation, so this is an explicit scope
addition: without it the route is reachable only by typing a URL and the issue is
not demonstrable to the founders.

CLE-26 ("Cleaner profile: pools and PWA polish") is expected to add a third tab.
Building the shell here and extending it there is cheaper than building a
header-link stopgap that CLE-26 replaces.

### Job done takes a second tap to confirm

`in_progress → completed` is irreversible: `update_job_status` has no transition
out of `completed`, the job leaves her list, and CLE-50's
`record_completed_job_ledger_entries` trigger writes the pay-ledger entries in
the same transaction.

The **Job done** button therefore becomes **Tap again to confirm** for a short
window instead of firing immediately. A second tap commits; tapping elsewhere or
letting the window lapse reverts the label. A modal dialog was rejected as the
wrong interruption for someone gloved and mid-service.

`on_the_way` and `in_progress` stay single-tap — they are reversible in effect,
carry no ledger consequence, and speed matters more there.

## Architecture

**One list screen, no detail route.** `/my-jobs` renders a list of cards, each
holding the job facts, the address reveal, the maps handoff and the status
control.

A `/my-jobs/[jobId]` detail route was rejected: it would add its own data load,
route guard and not-found state for no gain on a screen holding a handful of
jobs, and the reveal-on-tap decision already gives the card the expansion
behaviour a detail route would justify.

### Data flow

```
mount ─────────────► select cleaner_my_jobs ──► toMyJobs() ──► cards
                            ▲
status tap ──► update_job_status ──┤ re-read
Show address ─► get_cleaner_job_access ──► held in component state, by jobId
```

The address is never merged into the job list state and never persisted — it
lives in a separate map keyed by `jobId`, discarded on unmount.

Select only the columns the card draws, per the free-tier discipline in
`AGENTS.md`.

### Concurrency

The two races fixed in CLE-21 exist identically here — two cards, two mutations —
so this screen applies the same two mechanisms from the outset rather than
rediscovering them the hard way. They are written fresh here — CLE-21's copies
are not on this branch:

* a `Set` of in-flight job ids, so every acting card is held busy, not just the
  last one tapped;
* a ticket assigned to each list read **as it is issued**, with only the newest
  to land applied, so an older read answering late cannot revert another card.

## Module structure

| File | Responsibility |
| --- | --- |
| `features/board/format.ts` | Unchanged. `my-jobs` imports its formatters from here for now — see "Deferred: the formatter move" below. |
| `features/my-jobs/types.ts` | `MyJobRow` (view row), `MyJob` (domain object). |
| `features/my-jobs/model.ts` | `toMyJobs(rows: MyJobRow[]): MyJob[]` — maps and orders by `scheduledStart`. |
| `features/my-jobs/status.ts` | `toJobAction(status)` and `describeStatusError(error)`. |
| `features/my-jobs/access.ts` | `describeAccessError(error)` and the maps URL builder. |
| `app/(cleaner)/my-jobs/page.tsx` | Route: load, mutate, route failures. |
| `app/(cleaner)/my-jobs/my-job-card.tsx` | One job, presentational. |
| `app/(cleaner)/layout.tsx` | Gains the tab bar. |
| `src/test/supabase.tsx` | Supabase mock harness, written here. |
| `src/test/setup.ts` | Gains `afterEach(cleanup)` — see below. |

### What this branch does not inherit from PR #18

This branch starts from `origin/main`, which does not contain CLE-21. Three
things the design might otherwise have reused are simply absent here:
`board/page.test.tsx`, `board/application.ts`, and the `afterEach(cleanup)`
registration in `src/test/setup.ts`.

Only the last is a hard dependency. This project runs vitest without `globals`,
so testing-library never registers its own auto-cleanup and component tests
accumulate DOM across cases. **`src/test/setup.ts` gains the same three lines
here.** CLE-21 adds them too; the duplicate is expected and resolves trivially at
merge.

The Supabase mock harness and the concurrency mechanisms are written fresh on
this branch. They follow the same design CLE-21 arrived at, but they are not
imported from it.

### Deferred: the formatter move

`features/board/format.ts` holds pay, date, time and duration formatters that are
generic to both job surfaces, plus `describeOpenSlots`, which is board-specific.
The tidy arrangement is a shared `features/jobs/format.ts` with
`describeOpenSlots` left behind.

**Not done in this issue.** The move rewrites the import in
`board/vacancy-card.tsx`, and PR #18 also modifies that file — a guaranteed
conflict in a file that has already been reviewed, which is where a bad merge
resolution hides. `my-jobs` therefore imports from `@/features/board/format`
until both branches land, and the promotion becomes a small follow-up. Keeping
the two pull requests independently mergeable is worth more than module tidiness
for one cycle.

### Interfaces

```ts
// features/my-jobs/status.ts
export type JobAction =
  | { kind: "waiting"; reason: string }
  | { kind: "advance"; to: JobStatus; label: string; busyLabel: string }
  | { kind: "confirm"; to: JobStatus; label: string; confirmLabel: string; busyLabel: string };

export function toJobAction(status: JobStatus): JobAction;
export function describeStatusError(error: { message?: string } | null | undefined): string;

// features/my-jobs/access.ts
export function describeAccessError(error: { message?: string } | null | undefined): string;
export function toMapsUrl(address: string): string;
```

## The status machine

`toJobAction` is an exhaustive switch over `job_status` and mirrors
`update_job_status` exactly. The UI never offers a transition the RPC would
reject.

| Job status | Action | Label |
| --- | --- | --- |
| `draft`, `posted` | `waiting` | "Starts once the crew is complete" |
| `assigned` | `advance` → `on_the_way` | "On my way" |
| `on_the_way` | `advance` → `in_progress` | "Start work" |
| `in_progress` | `confirm` → `completed` | "Job done" → "Tap again to confirm" |
| `completed` | `waiting` | "This job is finished." |
| `cancelled` | `waiting` | "This job was cancelled." |

The last two arms are unreachable through the view, which filters both statuses.
They exist because the switch is exhaustive over `job_status`, and they return a
`waiting` action rather than throwing so that a card arriving through a route
this design did not foresee explains itself instead of offering a control.

The **Job done** confirmation window is **four seconds**: the button reverts to
"Job done" if the second tap does not arrive, and any other tap on the card
cancels it. Four seconds is long enough to read the confirmation and short enough
that a pocketed phone does not hold a live commit.

## Error copy

The RPCs raise fixed messages pinned by CLE-49's pgTAP suite, so they are a
stable contract to translate from. No raw Postgres string reaches the screen.

| RPC message | Shown to her |
| --- | --- |
| `Assigned cleaner access required` | "You are not on this job any more." |
| `Invalid job status transition` | "This job has already moved on." |
| `Job access is unavailable` | "We cannot show the address for this job any more." |
| anything else, status | "We could not update this job. Try again." |
| anything else, access | "We could not load the address. Try again." |

Failures route by where the job ended up after the re-read, reusing the rule
CLE-21 settled: gone from the list, or the re-read failed, puts the message in a
screen-level alert; still present and unchanged puts it on the card; still
present but changed drops it, because the card now explains itself.

## Maps handoff

```
https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(address)>
```

Opened in a new tab with `rel="noreferrer"`. A universal HTTPS link opens the
native app on Android and iOS, the browser elsewhere, and keeps working inside a
Capacitor shell (`docs/decisions/0004`). No platform sniffing, no `geo:` URI.

**Noted for the record:** this discloses the client's site address to Google at
the moment she taps. The address is already on her screen and hand-off to a maps
provider is the ordinary expectation of the control, but this is third-party
disclosure of customer data in a product that treats addresses as sensitive. It
was raised explicitly and accepted.

## Seed additions

The issue states that "seeded assignments make this demoable". They half do.

`seed.sql`'s one explicit assignment block — job
`10000000-0000-4000-8000-000000000801`, slots 1 and 2 — is followed immediately
by a statement setting that job to `completed`, which `cleaner_my_jobs` filters
out. But `generate_recurring_jobs()` also produces jobs from the seeded recurring
assignments, and those carry named-cleaner assignments. Verified against a fresh
`db:reset`: Demo Cleaner One already has four generated jobs on this screen, all
`crew_size` 2 with one slot filled, all sitting at `posted`.

So the **waiting state was already demoable and the status chain was not**: no
seeded job reaches `assigned`, which is the only status `update_job_status` will
move out of. The core of this issue could not be exercised at all.

Two jobs are therefore added to the seed:

* `…0802`, **`assigned`**, `crew_size` 2 with both seeded cleaners assigned. This
  is the necessary one: it exercises the crew-2 criterion and the whole status
  chain, neither of which any existing row can reach.
* `…0803`, **`posted`**, `crew_size` 2 with only Demo Cleaner One assigned. The
  generated jobs already cover this state, but they arrive through
  `generate_recurring_jobs()` with non-deterministic ids and drifting dates. A
  fixed id gives the acceptance suite something stable to assert on.

Both are scheduled with `now() + interval …` rather than a literal date, so the
suite cannot drift with the calendar the way CLE-20's did. Both follow the
existing seed's idempotent insert pattern. `seed.sql` is shared with the CRM, so
the additions use new ids only and edit no existing row.

## Testing

Full discipline: this is a product-law surface (the cleaner privacy boundary), so
RED precedes every production edit and no test is weakened to reach GREEN.

**Unit** — `model.test.ts` (mapping and ordering), `status.test.ts` (every
`job_status` arm, and that no arm offers a transition outside the RPC's three),
`access.test.ts` (error copy, maps URL encoding including addresses with spaces
and punctuation), `format.test.ts` (moved with the module).

**Component** — `my-job-card.test.tsx`: address hidden until the tap; revealed
after; the disabled control and its reason in the waiting state; the two-tap
confirmation on job done, including that a single tap does not fire the mutation.

**Page** — `my-jobs/page.test.tsx` using the shared harness: the two concurrency
cases, and failure routing between the card and the screen-level alert.

**Acceptance** — `tests/acceptance/cle-24-my-jobs.spec.ts` covering the issue's
five criteria. Criterion 1 — "before assignment no address or access notes appear
anywhere in the cleaner app" — is asserted app-wide, not screen-wide: sign in as
an unassigned cleaner and assert the address string is absent from every reachable
cleaner route, so that a future screen leaking it fails this test.

`npx impeccable detect` must exit 0 on the touched surfaces.

## Out of scope

* **Per-slot completion semantics.** The issue defers these deliberately; status
  is job-level and any assigned cleaner may advance it, at parity with the
  prototype.
* **Push notifications** — CLE-25.
* **The profile tab** — CLE-26. This design adds the shell it will extend.
* **Deployment and the join URL** — CLE-27.

## Risks and open items

* **The parity reference is unavailable.** The issue names `../clean-app`'s
  my-job card as the parity reference for this screen; that repository is not
  present on the development machine. The card is designed from `docs/PRODUCT.md`,
  `DESIGN.md` and the existing board card instead. If the prototype is available
  elsewhere, the card's visual treatment should be checked against it before
  CLE-28's design review.
* **PR #18 (CLE-21) is unmerged**, and the overlap is real rather than
  theoretical. Both branches append to `globals.css` and both add
  `afterEach(cleanup)` to `src/test/setup.ts`; both conflicts are additive and
  small. The one dangerous overlap — `board/vacancy-card.tsx` — is avoided by
  deferring the formatter move. Whichever lands second should re-run the other
  app's suite, not just its own.
* **The four-second confirmation window is a judgement call**, not a measured
  one. CLE-28's design review is the right place to challenge it against real
  use.

## Decision log

| Decision | Chosen | Rejected | Because |
| --- | --- | --- | --- |
| Address reveal | Explicit tap | Eager on list; on detail-route open | Keeps `site_access_log` a record of lookups rather than of renders |
| `draft`/`posted` job | Card stays, control disabled with a reason | Hide until startable; separate section | She must see work she is committed to; CLE-21's idiom already covers shut controls |
| Navigation | Two-tab bar in the cleaner layout | Header links; defer entirely to CLE-26 | Smallest thing that makes the issue demonstrable; CLE-26 extends rather than replaces |
| Job done | Second tap to confirm | Single tap; passive warning | Irreversible and writes the pay ledger; a warning that does not block does not address the risk |
| Screen shape | Single list, no detail route | List plus detail; expanding card | YAGNI on a screen with few jobs; reveal-on-tap already provides expansion |
| Formatters | Import from `features/board/format.ts`; promote later | Move to `features/jobs/format.ts` now | The move rewrites an import in `vacancy-card.tsx`, which PR #18 also edits; independent mergeability beats module tidiness for one cycle |
| Maps | Universal HTTPS Google Maps link | `geo:` URI; platform sniffing; clipboard only | Works on every target including a Capacitor shell; third-party disclosure accepted knowingly |
