# Design docs

One folder per build cycle (`<slug>/` holding `prd.md`, `hld.md`, `lld.md` as depth demands);
see the grill-with-docs and writing-design-docs skills for how these are produced.

- [Chat and the cleaner profile](chat-and-profile/prd.md) — in-app chat (job, candidacy,
  ad hoc) and the structured cleaner profile, validated with the internal cohort; starts
  after M8 lands. Also rewrites PRODUCT.md §3.2 phase deliverables.
- [Staff the work, both routes (alpha)](staff-the-work/prd.md) — CA-3, CA-4, CL-2: the
  staffing loop end to end. The first implemented slice closes board-application review in
  the CRM; directed offers remain a separate later slice in this cycle.
- [Phase A — company onboarding and cleaner adoption (alpha)](phase-a-adoption/prd.md) —
  CA-1, CL-1, OP-1 designed end-to-end on a fresh monorepo-owned Supabase project; roster,
  clients/sites, recurring assignments in `apps/crm`; the prototype's cleaner loop and
  minimal dispatch re-housed at parity (`apps/cleaner` + CRM), prototype retired from
  runtime. Architecture in [hld.md](phase-a-adoption/hld.md); component internals and
  the delivered-vs-design gap map in [lld.md](phase-a-adoption/lld.md).
