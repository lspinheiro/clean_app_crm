---
version: 1
slug: "apps-cleaner-src-app-cleaner-board-page-tsx"
primary_target: "apps/cleaner/src/app/(cleaner)/board/page.tsx"
related_targets: ["apps/cleaner/src/app/(cleaner)/board/vacancy-card.tsx","apps/cleaner/src/app/(cleaner)/layout.tsx","apps/cleaner/src/app/globals.css"]
---

## Scope and mode

- Surface: Cleaner vacancy board (`/board`) and its vacancy cards.
- Mode: Operate.
- Audience: Ana, a phone-only cleaner who scans work between companies and interruptions.
- Job: Compare open vacancies quickly, apply once, and understand that an application is not an assignment.

## Chosen direction

- Approved comp: `.impeccable/mocks/board-opportunity-ledger.png`.
- Direction: Opportunity ledger — time, duration, and pay form the comparison row; company, site/suburb, service, and open spots supply the decision detail.
- Memorable moment: a slim, unmistakable applied-status band says the company will confirm and that the cleaner is not assigned yet.

## Constraints

- Inherit Trust Blue from `DESIGN.md`; restrained colour, 8px buttons, 12px cards, quiet borders and shadows.
- Complete `en-AU` and `pt-BR` support, including navigation, formatting, loading, empty, error, busy, and application states.
- Preserve user-authored company, site, and service text exactly as stored.
- Preserve assignment-gated privacy; do not add address, access notes, client phone, client charge, filters, availability, or other later-cycle features.
- Mobile-first at 390px with 44px minimum targets; desktop keeps a centred app surface and bounded navigation.

## Implementation fidelity

| Ingredient | Required treatment | Medium |
|---|---|---|
| App shell | Trust Blue brand mark, locale control, profile identity, bounded mobile frame | Semantic HTML/CSS + existing brand component |
| Applied state | Full-width primary tint band, explicit confirmation and not-assigned copy, quiet Withdraw action | Semantic HTML/CSS |
| Open section | Visible heading and localised count before the vacancy list | Semantic HTML/CSS |
| Vacancy summary | Date block, time/duration, large tabular pay in one comparison row | Semantic HTML/CSS |
| Vacancy detail | Company, site/suburb, service, open spots; no private fields | Semantic HTML/CSS |
| Primary action | Full-width Trust Blue `Apply for job`, 52px high, explicit busy state | Native button |
| Bottom navigation | Two labelled icon links, bounded to the mobile surface, active state uses colour + text | Semantic links + existing icon library |
| Loading/empty/error | Geometry-preserving skeletons; restrained bubble empty state; direct Retry | Semantic HTML/CSS/SVG |

## Non-literal comp details

- The comp is a hierarchy and component-language north star, not a source of fixed job values.
- Runtime dates, pay basis, crew counts, names, and translations come from existing data and locale formatters.
- The generated outline icons may be replaced with the repository's approved icon library while preserving meaning and weight.
