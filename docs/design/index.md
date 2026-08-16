# Design docs

One folder per build cycle (`<slug>/` holding `prd.md`, `hld.md`, `lld.md` as depth demands);
see the grill-with-docs and writing-design-docs skills for how these are produced.

- [Phase A — company onboarding and pool adoption (alpha)](phase-a-adoption/prd.md) —
  CA-1, CL-1, OP-1 designed end-to-end on a fresh monorepo-owned Supabase project; roster,
  clients/sites, recurring assignments in `apps/crm`; the prototype's cleaner loop and
  minimal dispatch re-housed at parity (`apps/cleaner` + CRM), prototype retired from
  runtime. Architecture in [hld.md](phase-a-adoption/hld.md); component internals and
  the delivered-vs-design gap map in [lld.md](phase-a-adoption/lld.md).
