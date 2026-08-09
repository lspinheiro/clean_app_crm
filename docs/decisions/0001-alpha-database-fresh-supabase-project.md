# Alpha database: fresh Supabase project, schema owned by this monorepo

The alpha needs the CRM and the cleaner app on one database, but the prototype's Supabase
project and migration history belong to the co-founders' repo, and collaboration is not yet
formalised (PRODUCT.md Appendix B). We provision a new Supabase project for the alpha:
`packages/db` holds the canonical schema, seeded by adapting the prototype's migrations as
a starting point and then evolved freely — the prototype does not run against this
database (decision 0002), so its table names, role values, and RPC signatures impose no
compatibility constraints. The co-founders' existing deployment stays untouched as a demo;
there is no production data to migrate.

## Consequences

- Schema changes land in `packages/db` only; never in the prototype repo.
- Vocabulary is PRODUCT.md-aligned from the first migration: `clients` and `sites` as
  separate records, `recurring_assignments`, per-slot `job_assignments`, and a role enum
  with no "boss" value.
- Adapting the prototype's schema and RPC patterns is part of the co-founder IP
  conversation (PRODUCT.md Appendix B q1) — flagged in the Phase A design doc's open
  questions.
