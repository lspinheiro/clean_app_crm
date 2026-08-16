---
type: Product and domain reference
title: Cleaning CRM Product Model and Roadmap Guardrails
description: The implemented CRM job loop models clients, sites, jobs, crew slots, assignments, and vacancy projection. Product v0.4 additionally specifies future cleaner agenda, job-type preferences, field events/chat, and a wrapper-ready PWA surface.
tags: [domain-model, scheduling, vacancy, product, alpha]
openwiki:
  roles: [domain, workflow]
  source_paths: [README.md, PRODUCT.md, docs/PRODUCT.md, docs/design/phase-a-adoption.md, docs/decisions/0004-cleaner-surface-wrapper-ready-pwa.md]
  invariants: [Vacancy is a projection of unfilled crew slots., Jobs have crew size of at least one and per-slot assignments., The alpha runs on monorepo apps and the prototype is reference material only.]
---

# Cleaning CRM Product Model and Roadmap Guardrails

## Sources and status

`docs/PRODUCT.md` is the canonical product strategy in this repository; the root `PRODUCT.md` is its compact product record. Product v0.4 adds F14 and updates product direction, while current source/tests establish what actually runs. The implemented job slice is documented in [job dispatch](../workflows/job-dispatch.md) and the database contracts in [data and security](../architecture/data-and-security.md). The sibling `../clean-app` prototype is reference material only—not a runtime dependency or authority—and the alpha is intended to run on monorepo apps.

## Implemented job loop and product direction

The current CRM/database model includes clients and sites, jobs with `crew_size`, per-slot `job_assignments`, application/pool-related foundations, recurring-assignment/generation migrations, and direct one-off-job creation. The definitive runtime lifecycle is [the dispatch workflow](../workflows/job-dispatch.md#crew-slot-lifecycle).

```mermaid
flowchart LR
    Client --> Site
    Site --> Recurring["Recurring assignment"]
    Recurring --> Job
    Site --> OneOff["One-off job"]
    OneOff --> Job
    Job --> Slots["Numbered crew slots"]
    Slots --> Assignment
    Slots --> Vacancy["Vacancy projection when unfilled"]
    Vacancy --> Board["Future cleaner board"]
```

The diagram distinguishes present scheduling/persistence concepts from the future cleaner-board consumer. Vacancy is a view/projection over unfilled crew slots, not a table; roster and future board consumers must not introduce a bypassing outbound object.

### Product laws

- Jobs have `crew_size >= 1` and per-slot assignments. A vacancy is an unfilled slot, and released history remains meaningful for dispatch presentation.
- The ledger records agreed amounts and settlement state; it never moves money. No worker payment surface or fee is allowed.
- Cleaner access is assignment-gated: future cleaner views/RPCs must not expose client phone, client charge, or internal notes, and address/access notes appear only after assignment.
- Reviews are structured rather than public free-text ratings. Vetting/identity material is minimised and restricted.
- Critical workflow mutations belong in atomic database RPCs with first-accept-wins handling where the workflow requires it. See [data/security](../architecture/data-and-security.md#security-and-product-constraints).

## v0.4 product changes

Product v0.4 makes `docs/PRODUCT.md` canonical locally and replaces alpha exit criteria with qualitative partner-company validation. It adds or clarifies the following requirements; none is proof of a current `apps/cleaner` implementation.

| Direction | Product meaning | Implementation status |
|---|---|---|
| F11 cleaner weekly agenda | A cleaner sees accepted assignments from all joined pools in one week view; each entry opens its job card. | Planned; no `apps/cleaner` package exists. |
| F5 job-type preferences | Cleaner preferences order board jobs alongside availability; later they become a search/shortlist signal. | Planned; not in current consumer UI. |
| F14 job chat and field events | Assigned cleaner and company have a per-job thread; structured can't-attend, issue, lost-and-found, and extra-charge events are prioritised. Can't-attend enters the dropout/vacancy flow; free text is MVP and AI assistance is P1. | Planned; no chat tables, storage, RPCs, or UI are implemented. |
| Qualitative alpha validation | Partner feedback supports design; it is not analytics or a quantified exit gate. | Product process direction. |

F14's design principle is that the job card carries logistics while the thread absorbs exceptions. Structured events must trigger visible workflow handling rather than becoming free text an administrator can miss. Event participants are assignment-gated; pay stays structured and human-approved; photos would require restricted job-record storage; client contact details must not surface in the thread.

## Future cleaner surface: ADR 0004

ADR 0004 specifies a wrapper-ready PWA for the future `apps/cleaner`: client-first, static-exportable, PKCE client authentication, client Supabase access through cleaner views/RPCs, a narrow push-registration abstraction, and service-worker app-shell caching. The acquisition path remains web/link-first. A Capacitor shell is conditional on alpha evidence that iOS web push does not reliably reach real cleaners; it is a retention option, not the front door. CRM remains web/SSR-capable.

When implementing this surface, consult the ADR and [data/security](../architecture/data-and-security.md) before creating a route: do not add server actions or dynamic route handlers that defeat static export, do not access company tables directly, and isolate Web Push/native push differences behind the specified abstraction. Add focused cleaner tests and update the backlog only when a package, consumer contract, and validation command exist.

## Change navigation

For a current job/slot change, begin with [job dispatch](../workflows/job-dispatch.md) and its tests. For a schema/RLS/RPC change, begin with [data and security](../architecture/data-and-security.md). For a roadmap change, read the relevant F-number and journey in `docs/PRODUCT.md` before changing this page or code; do not turn a later MVP/P1 requirement into alpha scope without product evidence.
