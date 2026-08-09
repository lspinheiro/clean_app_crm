# The alpha runs entirely on monorepo apps; the prototype is reference, not runtime

PRODUCT.md §3.4 describes the alpha as "layered directly on the prototype", and the obvious
build was to keep the deployed `../clean-app` running for both sides while the CRM grew
alongside it. We decided otherwise: the alpha cohort uses only apps from this monorepo —
`apps/crm` for the company side and a minimal `apps/cleaner` carrying the prototype's
cleaner loop at parity (join, board, one-tap apply, my jobs with gated address, status
taps, job-done, money view, push), with the CRM absorbing the minimal dispatch surfaces
(applicants, per-slot assign, mark paid, one-off jobs). The prototype is a local reference
for UI fidelity and mechanics; it never runs against the alpha database.

Why: it removes the runtime compatibility surface entirely (no mirror columns, no legacy
table names, no `boss` role value), removes the dependency on redeploying the co-founders'
code before the collaboration is formalised, and unblocks cycle 2's cleaner-side features
(availability toggle, urgent offers, outcome capture) which would otherwise wait on
prototype changes. The trade-off, accepted knowingly: the first cycle grows by the parity
port and minimal dispatch — capability re-housed, not redesigned.

## Consequences

- "Kept from the prototype as-is" (§3.4) now means *capability parity across the monorepo
  apps*, not the prototype binary; PRODUCT.md's §3.4 wording should be revised upstream
  (it is synced from the `personal_website` repo — never hand-edit it here).
- Superseded during the same session: the earlier decision to keep the prototype's
  `clients` table as the site-level record existed only to avoid breaking the running
  prototype; with no prototype at runtime, `clients`/`sites` split properly from day one.
