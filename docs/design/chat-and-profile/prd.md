# Chat and the cleaner profile — PRD

## Project specifics

- **Status:** draft
- **Stage:** alpha (redefined 2026-08-26 — see decision 1 and PRODUCT.md §3.2)
- **Journeys:** [CL-13](../../PRODUCT.md) (show who I am), CA-14 (evaluate a person from
  the profile), CL-14 (message the company), CA-15 (message a cleaner) — new in Phase B —
  plus the CL-11/CA-13 job-thread slice (free text, photos, can't attend)
- **Features:** F14 (job chat and field events), F7 (messaging), F5 (candidate database,
  search, and availability), F15 (bilingual experience applies to every shipped surface)
- **Participants:** Leonardo (product owner); —
- **Project:** — (added by `to-features`)
- **Design reference:** —
- **Date:** 2026-08-26

## Goals and business objectives

Validate two product values with the internal cohort:

1. **Chat.** Company admins and cleaners move their work conversations from WhatsApp into
   the app.
2. **Profile.** A company admin evaluates a person from a structured profile — expertise,
   availability, region preferences — at join-request review and after admission.

This section is provisional. The grilling session refines it.

## Background and strategic fit

This cycle replans the roadmap after the Phase A gap-closure Milestones. It starts when
M8 (hourly contracts) lands; M6 (directed offers) and M7 (invite links as real offers)
land before it. The founders' product brainstorming raised chat and the profile to the
top validation priority. This session also rewrites PRODUCT.md §3.2 so the phase roadmap
records that priority.

## Assumptions

—

## User stories

—

## User interaction and design

### Conversation model (confirmed 2026-08-26, decision 2)

The model is a counterpart inbox with two thread kinds — the pattern of Airbnb
(reservation-scoped threads with a context header) and Upwork (per-contract rooms plus a
persistent direct thread), not the single WhatsApp conversation:

1. **Inbox grouped by counterpart.** The CRM inbox lists people (cleaners and
   join-requesters), latest activity first. The cleaner app inbox lists companies. One
   tap opens that counterpart's conversation space — general thread on top, job threads
   under it.
2. **General thread** — one per company↔person relationship. It opens when the join
   request is created; candidacy questions are its first content. It survives admission
   and carries ad-hoc and relationship talk. Rejection makes it read-only.
3. **Job thread** — one per job per assigned cleaner, opened at slot assignment.
   Participants: that cleaner and the company's admins. On a crew job, each assigned
   cleaner gets their own job thread; crew mates never read each other's messages.
4. **Job context header.** The job thread leads with the job card — site, service, time,
   status, crew slot — so "what happened on this job" is one scoped place.
5. **Lifecycle.** The job thread goes read-only a few days after completion; later
   follow-ups go to the general thread. A cancelled job or a released slot also closes
   its thread.
6. **Events live in the job thread.** Structured field events render inside the job
   thread timeline. Pay figures appear only as structured events, never negotiated in
   prose (product law).
7. **No pre-assignment job thread.** Applicants and pending-offer recipients ask
   questions in the general thread. Assignment gating on job context stays intact, and
   a posted vacancy never spawns per-applicant threads.

### Cleaner profile (confirmed 2026-08-26, decision 4)

One profile per **person**, maintained once and shown to every company the person
requests to join or works for — never a per-company copy. Fields for this cycle:

| Field | Shape |
|---|---|
| Service-type skills | multi-select from the platform service-type catalogue (same IDs as job service types) |
| Years of experience | a number |
| Weekly availability | weekly grid (pulled forward from MVP; the available-today toggle stays deferred) |
| Region preference | multi-select of coarse platform-defined Gold Coast regions |
| Languages | multi-select |
| Transport | has car / public transport |
| Photo | optional |
| Note | optional free text (exists today on the join request) |

**Consumption surfaces (decision 6):** this cycle delivers the three admin-side
evaluation surfaces — the join-request review queue, the cleaner record in Staff, and
profile chips on job-detail applicant lists. The service-type field is one merged field
(the work the person does and wants). Board ordering by profile and Staff-list search
facets are deferred (see What we're not doing).

**Capture flow (decision 5):** registration asks for the profile in a second step after
the account basics. Skills, availability, region, and transport are required but
tap-only — no typing except the optional note — so the flow stays under a minute on a
phone. The photo is optional. Existing cleaners (Phase A and M7-era joiners) get a
completion prompt on their next app open. The review queue shows profile completeness,
so a thin profile is visible, never hidden. M7's registration scope is not amended;
this cycle owns all profile work.

## Open questions

| Question | Owner | Answer |
|---|---|---|
| Which release stage does this cycle ship under, given §3.4 excludes free-text messaging from the alpha? | Leonardo | Alpha. The alpha is redefined as the internal product-market-fit validation stage; its backlog is set cycle by cycle (decision 1). |
| What is the thread model — one thread per company–cleaner pair, per-job threads, or both? | Leonardo | Both: a counterpart inbox with one general thread per relationship plus one job thread per job per assigned cleaner (decision 2). |
| What can a person and a company say to each other before admission (candidacy chat), and inside which privacy boundary? | Leonardo | The general thread opens at join request; free text both ways. The app-side data boundary is unchanged — no board, vacancy, or site data before admission (decision 2, rule 2 and 7). |
| Does this cycle deliver the structured field events (F14) with the free-text thread, or free text only? | Leonardo | Free text + photo messages + the **can't attend** event only (decision 3). |
| Which profile fields does this cycle capture, and on which surfaces (registration, review queue, cleaner record)? | Leonardo | Fields settled (decision 4): service-type skills, years of experience, weekly availability grid, region preference, languages, transport, optional photo and note. Surfaces under discussion. |
| Where does M7's registration/review scope end and this cycle's profile scope begin? | Leonardo | M7 stays as scoped; this cycle owns all profile work, including the registration second step and the completion prompt for existing cleaners (decision 5). |
| What happens to the undelivered alpha delta items (dropout flow, field events, weekly agenda, availability toggle, first-job marker) and to M9/M10? | Leonardo | Re-homed by the §3.2 restructure (decision 7): Phase B takes the thread slice and the profile grid; the Phase C pool takes the rest; M9/M10 queue behind this cycle. |

## What we're not doing

**Not now (later cycles):**

- The **report issue**, **lost & found**, and **extra charge** field events (decision 3).
  A photo message covers the first two well enough to validate chat; extra charge is a
  pay-ledger (product-law) surface and gets its own slice.
- The automatic urgent re-post and offer cascade (F13). The can't-attend event releases
  the slot and alerts the admin; re-posting stays a manual admin action.
- Cleaner-side board ordering by profile and Staff-list search facets (decision 6).
  They are matching features; this cycle validates evaluation and chat.

## Decision log

### 1. The alpha is the whole internal validation stage; its backlog is set cycle by cycle (2026-08-26)

PRODUCT.md §3.4 declared a fixed ten-item alpha backlog and excluded free-text messaging
from the alpha. The founders redefined the stage: the alpha is the full internal,
invite-only period whose goal is to validate product–market fit in a controlled test
environment. Each build cycle's PRD defines what its cycle ships; the product moves to
MVP (public launch) when internal testing has validated product–market fit, not when a
fixed feature list completes. This lets chat and the cleaner profile ship inside the
alpha. Considered option: close the alpha at M8 and open a new named internal stage —
rejected because one flexible internal stage is simpler and matches how the founders
actually work.

### 2. Conversations are a counterpart inbox with two thread kinds (2026-08-26)

Chat follows the Airbnb/Upwork pattern, not the single WhatsApp conversation: one
persistent **general thread** per company↔person relationship (opened at join request,
read-only on rejection) plus one **job thread** per job per assigned cleaner (opened at
slot assignment, read-only a few days after completion, structured events rendered
inline). Crew mates never share a thread, and no thread exists for a job before
assignment — applicants and pending-offer recipients use the general thread. This
supersedes the F7 v0.4 "unified view aggregates job threads" wording: the general thread
is a real channel, not an aggregation, and PRODUCT.md F7/F14 are rewritten to this
model. Considered options: one thread per relationship with job tags (rejected — both
sides would browse long conversations to find what happened on one job); shared crew
threads (rejected — per-slot matters like dropouts and pay adjustments must stay
private); pre-assignment job threads, the Airbnb inquiry pattern (rejected — floods
admins with per-applicant threads and weakens assignment gating).

### 3. Thread content: free text, photo messages, and only the can't-attend event (2026-08-26)

F14 planned structured events first and the free-text thread later; this cycle inverts
that order to validate chat. Messages carry free text and photos. Of the four F14 field
events, only **can't attend** ships: it releases the slot and alerts the admin, and
re-posting stays manual — schedule-shaped news must never be free text an admin can
miss. Report issue and lost & found are deferred (a photo message covers them during
validation); extra charge is deferred because it mutates the pay ledger, a product-law
surface that deserves its own slice.

### 4. One cross-company cleaner profile; grid availability; coarse regions (2026-08-26)

The cleaner profile belongs to the person: one profile, maintained once, visible to
every company the person requests to join or works for (the Airbnb-guest pattern) —
never a per-company copy. The weekly availability grid is pulled forward from MVP
because candidacy evaluation needs a pattern, not a toggle; the available-today toggle
stays deferred to the urgent-backfill work. Region preference is new product surface and
uses a coarse platform-defined Gold Coast region list, not suburb-level selection —
a four-tap answer filters well at this cohort's size. Skills reuse the platform
service-type catalogue so profiles stay comparable across companies (F5).

### 5. Profile capture is a required tap-only registration step; M7 stays unchanged (2026-08-26)

This cycle owns all profile work — M7's registration scope is not amended, so M8 and
this cycle's start do not slip. Registration gains a second step where skills,
availability, region, and transport are required but tap-only (under a minute on a
phone); the photo is optional. Existing cleaners get a completion prompt on next app
open, and the review queue shows profile completeness. Considered options: amend M7 to
capture the profile from the start (rejected — M7 is already the largest queued
milestone); optional profile with later prompts only (rejected — the review queue would
fill with empty profiles and candidacy evaluation would have nothing to evaluate).

### 6. Profile consumption is admin-side evaluation only; one merged service-type field (2026-08-26)

This cycle delivers the review queue, the cleaner record, and applicant-list profile
chips. Cleaner-side board ordering is deferred even though F5 v0.4 promised it "from
alpha" — it is a matching feature, and this cycle validates evaluation and chat; F5 is
rewritten to match. The profile's service-type field merges skills and preferences into
one field ("the work I do and want"); the split returns only if MVP matching proves the
distinction matters. Search facets stay MVP — they pay off at a headcount the internal
cohort does not have.

### 7. PRODUCT.md §3.2 phases become delivery phases; Phase B names this cycle (2026-08-26)

§3.2 regrouped its journeys from job-lifecycle themes into five delivery phases:
**A — Adoption and the operations base** (delivered; closes with M6–M8); **B —
Communicate and evaluate** (this cycle: new journeys CL-13, CA-14, CL-14, CA-15, plus
CL-11/CA-13 re-staged to a free-text-thread slice); **C — Run the day and recover** (a
pool whose content and order the founders confirm at cycle start); **D — Grow and
trust** (MVP, the public-launch package, absorbing the old settlement-phase MVP items);
**E — Deepen and automate** (P1). M9 (Google sign-in) and M10 (bulk import) are
conveniences, not journeys; they queue behind this cycle. Considered option: keep the
thematic lifecycle phases and add a separate roadmap subsection — rejected because
"Phase B" would keep two meanings, and delivery has already ignored the thematic order
twice.
