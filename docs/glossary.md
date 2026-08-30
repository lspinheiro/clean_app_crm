# Glossary

Canonical vocabulary for The Clean Crew. When code, docs, issues, or conversation conflict
with this file, either this file wins or this file gets fixed — never both meanings at
once.

## Application

A request for one specific [job](#job) or [recurring assignment](#recurring-assignment).
A cleaner on the staff applies from the board; a candidate applies through a job-bound
[posting](#posting). Both are the same kind of thing, and the application is itself the
consent to the work — no separate acceptance follows. A candidate's applications live
under that person's [join request](#join-request); one person can hold applications to
several postings of the same company at the same time.

- **Not:** a [join request](#join-request) (entry to the [Cleaner staff](#cleaner-staff),
  not a request for one job), and not an [offer](#offer) (company-initiated, needs the
  cleaner's acceptance).
- **See:** [Posting](#posting) · [Hire](#hire) · [Join request](#join-request) ·
  [Vacancy](#vacancy).

## Cleaner staff

The set of cleaners attached to one [company](#company) — the people it can offer work to.
**Cleaner staff** is the collection, **Staff** is the CRM navigation label, and the Staff screen
is where a company admin manages it. A person registers through a [posting](#posting)'s
link, which creates a **join request**; the **cleaner membership** exists only after a
company admin admits that request. The company-side screen listing vacancies and who
is covering them is the **cleaner board**; on the cleaner app the same surface is simply the
*board*.

- **Not:** a "pool" — the word is retired as product vocabulary and appears in no UI label.
  Say *Cleaner staff* for the collection and *cleaner* as the modifier (cleaner invitation,
  cleaner membership, cleaner board); a single person is a *cleaner*, never a "pool member" or
  "pool cleaner". Internal identifiers may retain `pool` where renaming them would change a
  database or API contract.
- **Database note:** the schema still carries the legacy `pool_*` names —
  `cleaner_pool_memberships`, `join_company_pool`, `prepare_pool_invite_email_batch`,
  `prepare_pool_invite_email_retry`, `record_pool_invite_email_results`, and the
  `pool_size` column. These map one-to-one onto the cleaner-membership and cleaner-invite
  concepts here. Migrations are immutable and `database.types.ts` is generated, so the
  mismatch is deliberate: keep SQL identifiers exact in code and only rename the app layer.
- **See:** [Membership](#membership) · [Company](#company) · [Vacancy](#vacancy).

## Client

The commercial party a cleaning company serves and bills — a hotel group, an STR property
manager, an office tenant. A client has contact details and one or more [sites](#site).

- **Not:** the *site* where work happens — a client can have many sites, and jobs attach to
  a site, not to the client directly. Also not the cleaning company itself (that is the
  *company*).
- **See:** [Site](#site).

## Company

The cleaning business operating on the platform — the CRM's tenant. A company owns its
clients, sites, recurring assignments, jobs, and its own private set of
[cleaners](#cleaners).

- **Not:** the [client](#client) (the commercial party the company cleans for), and not
  the platform itself.
- **See:** [Company admin](#company-admin) · [Client](#client) · [Cleaners](#cleaners).

## Company admin

The person operating a [company](#company) on the platform through an employee
[membership](#membership) — persona: Thiago. The umbrella term for a company-side user;
the membership role is [owner](#owner) or [staff](#staff). We say *company admin*, or
*cleaning company* for the business as a whole.

- **Not:** "boss" — prototype jargon, rejected; it never appears in UI, docs, or
  identifiers. Also not a stored role since the membership model (Phase A PRD decision
  #16) — the stored roles are `owner` and `staff` on the membership.
- **See:** [Company](#company) · [Membership](#membership).

## Crew slot

One position in a job's crew. A job carries crew size ≥ 1 and each slot is assigned (or
unfilled) independently; "per-slot assignment" means a two-cleaner job can have one slot
assigned and one still open.

- **Not:** a separate job — sibling slots belong to one job with one client charge and one
  schedule.
- **See:** [Job](#job) · [Vacancy](#vacancy).

## Hire

The company's positive decision on a candidate's [application](#application): one act
that admits the person to the [Cleaner staff](#cleaner-staff) and assigns the applied-for
work. The outcome is shown to the person as the job, not as staff entry. A candidate the
company does not hire keeps an ordinary waiting [join request](#join-request).

- **Not:** *admit* (staff entry without a job) and not an [offer](#offer) acceptance —
  the application already carried the cleaner's consent.
- **See:** [Application](#application) · [Join request](#join-request) ·
  [Posting](#posting).

## Job

A scheduled piece of work at a [site](#site): start time, duration, crew size ≥ 1, cleaner
pay per slot (a fixed amount, or an hourly rate — the admin picks the pay basis per job),
optional client charge. Jobs are created one-off or generated by a
[recurring assignment](#recurring-assignment), and move through the operational lifecycle
(scheduled/posted → assigned → in progress → completed, with cancelled and unfilled edges).

- **Not:** a *vacancy* (an unfilled crew slot on a job that needs covering) and not the
  *recurring assignment* (the rule that generates jobs). "Job instance" is acceptable when
  stressing that a job came from a recurring assignment; the entity is still a job.
- **See:** [Crew slot](#crew-slot) · [Recurring assignment](#recurring-assignment) ·
  [Vacancy](#vacancy).

## Join request

A person's request to become one of a [company](#company)'s cleaners — the single
relationship state (waiting, admitted, or rejected) between one person and one company.
The request is created when the person registers from a [posting](#posting)'s link. A
[company admin](#company-admin) then **admits** or **rejects** it, and only admission —
or a [hire](#hire) on one of the person's applications — creates the
[cleaner membership](#membership). A request that waits gives the person no access to
the company's work: no board, no vacancies, no site details. A candidate's
[applications](#application) to the company's job-bound postings live under this one
request.

- **Not:** an [application](#application) (a request for one specific job), not an
  [offer](#offer) (work the company gives to one named cleaner), and
  not a recruitment *candidate* (PRODUCT.md F4/F6, MVP). Say *admit* and *reject* — never
  "approve/deny", and never "accept/decline", which belong to offers.
- **See:** [Cleaner staff](#cleaner-staff) · [Membership](#membership) ·
  [Company admin](#company-admin) · PRD decisions #22–#29 in
  [phase-a-adoption](design/phase-a-adoption/prd.md#decision-log).

## Membership

The link between one user account and one [company](#company). There are two kinds. An
**employee membership** carries a company-side role — [owner](#owner) or
[staff](#staff) — and is created by an owner's invitation. A **cleaner membership** makes
the account one of the company's [cleaners](#cleaner-staff) and is created when a company
admin admits a [join request](#join-request). One account can hold many memberships, of both kinds, across companies — the
model never forces a person to hold two logins.

- **Not:** the account itself (one account holds many memberships), and not a role — the
  role lives on the employee membership. Never a "pool membership": the database table
  `cleaner_pool_memberships` keeps its legacy name, the concept does not.
- **See:** [Owner](#owner) · [Staff](#staff) · [Company](#company) ·
  [Cleaners](#cleaners).

## Offer

Work the [company admin](#company-admin) gives to a specific cleaner, pending that
cleaner's acceptance. Acceptance confirms the cleaner saw the work and confirmed
availability; it completes the assignment. An offer covers one [job](#job) or one
[recurring assignment](#recurring-assignment) — for a series, one acceptance is standing
consent for all follow-up instances. A decline returns the work to the admin.

- **Not:** a board *application* (cleaner-initiated; the application is itself the
  consent, so assignment from applicants needs no acceptance step), and not the automatic
  *offer cascade* (F13, a later cycle).
- **See:** [Job](#job) · [Recurring assignment](#recurring-assignment) ·
  [Vacancy](#vacancy).

## Owner

The senior company-side role on a [membership](#membership). An owner has full control
of the [company](#company): employee management (invite an employee, change a role,
remove an employee), company settings, and all [staff](#staff) capabilities. The
founder-invited first admin holds the first owner membership.

- **Not:** the platform operator (internal `admin` role), and not the [client](#client).
- **See:** [Staff](#staff) · [Membership](#membership) · [Company](#company).

## Posting

The object a [company admin](#company-admin) creates to seek candidates: a public page
plus its link. A posting carries exactly one intent — an **expression-of-interest
posting** (entry to the [Cleaner staff](#cleaner-staff), free-typed description), a
**one-time posting** (bound to one [job](#job) with an unfilled crew slot), or a
**regular posting** (bound to one [recurring assignment](#recurring-assignment)).
Job-bound postings render their page from the record — schedule, service type, suburb,
pay — plus one admin-written description; they close by themselves when the work fills
or its start time passes. A posting is revocable and never regenerated. The word absorbs
*cleaner invitation*: the invitation link is a posting's link.

- **Not:** the [vacancy](#vacancy) itself — a posting distributes a vacancy to people
  outside the staff, while the board shows vacancies to the staff. Also not a
  *position* (that word means one crew slot) and not an *opening* (rejected vacancy
  synonym).
- **See:** [Application](#application) · [Join request](#join-request) ·
  [Vacancy](#vacancy) · [Hire](#hire).

## Recurring assignment

The standing rule that keeps a site on the schedule: "every Tuesday 8:00, 6 h, site X,
assigned to Maria." It generates [job](#job) instances ahead of time. The named cleaner
accepts the series once ([offer](#offer)); after that, instances generate already assigned
under that standing consent — no per-instance re-acceptance. Instances generate as open
slots when no cleaner is set.

- **Not:** the generated job itself, and not a booking imported from an external system
  (external ingestion is paid-tier scope).
- **See:** [Job](#job) · [Vacancy](#vacancy).

## Service type

The kind of cleaning work a job carries — for example residential, bond, hotel/STR,
post-construction (PRODUCT.md F5). The platform owns the catalogue of service types;
companies pick from it and do not define their own types. Service types are comparable
across companies: a cleaner's job-type preference (F5) means the same thing at every company.

- **Not:** a per-company label — companies do not invent service types (alpha decision;
  see the Phase A PRD decision log). Also not the *service* rendered on one job — that is
  the job itself.
- **See:** [Job](#job) · [Site](#site).

## Site

The physical location where cleaning work happens: address, suburb, access notes, and
per-site defaults (service, duration, rate). Site address and access notes are
assignment-gated: a cleaner sees them only after being assigned to a job at that site.
Every site belongs to exactly one [client](#client); a single-site client is simply a
client with one site.

- **Not:** the *client* (the commercial party). We say *site*, not *property* or
  *location*, in UI and docs.
- **See:** [Client](#client).

## Staff

The day-to-day company-side role on a [membership](#membership): clients, sites,
recurring assignments, roster, jobs, dispatch, and the company's cleaners. A staff member cannot
manage employees and cannot change company settings.

- **Not:** a cleaner — staff operate the CRM; cleaners do the work and use the cleaner
  app. Also not the [owner](#owner).
- **See:** [Owner](#owner) · [Membership](#membership).

## Vacancy

An unfilled [crew slot](#crew-slot) that needs covering — produced by a roster gap, a job
instance with no available cleaner, or a dropout. A vacancy carries everything a taker
needs: site, time, duration, rate, crew slot, and preferred-cleaner order. All distribution
(board, cascade, share links, agents) consumes vacancies; no outbound feature bypasses them.
It is a projection of job state, not a separately managed record: a vacancy exists exactly
while its slot is unfilled on an open job.

- **Not:** an *opening* or *shift* (rejected synonyms), and not the job itself — a
  two-cleaner job with one slot filled has exactly one vacancy.
- **See:** [Job](#job) · [Crew slot](#crew-slot).
