# The Clean Crew — Design System

The single visual world for both apps (`apps/crm`, `apps/cleaner`). Canonical: the Stitch
design system is derived from this file (`upload_design_md`), never edited in Stitch.
Current direction: **Trust Blue**, adopted 17 Aug 2026 from the palette exploration in
`docs/research/ux-design.md`; the approved reference screen is
`mockups/redesign/trust-blue-approved.html` (Stitch screen
`af56308a78bf477b9f7f256f1f94974f`, project `clean-app-crm`). This supersedes the
ink-on-paper system seeded from the `../clean-app` prototype.

The product is bilingual from alpha: every shipped surface in both apps supports Australian
English (`en-AU`) and Brazilian Portuguese (`pt-BR`). **The Clean Crew** is the product name in
both languages and is never translated.

## Point of view

Calm operational utility: roughly **80% neutral surfaces, 15% brand colour, 5% semantic
status colour**. Surfaces stay quiet so structured data reads first; brand blue signals
the primary action, the active place in the app, and "now" (today) — semantic colour is
reserved for state. The brand motif remains the soap bubble (outlined circles, motion
makes them read as bubbles) drawn in brand blue and accent cyan; it appears in loaders
and empty states, never as background decoration. The brand mark is the **bubble-crew
cluster** — one filled `primary` bubble with a highlight, one `accent` and one slate
(`text-muted`) outlined bubble huddled behind it, each separated by a white halo
(master: `apps/crm/src/components/brand-bubbles.tsx` and `src/app/icon.svg` in both
apps; source concept: `mockups/brand/bubble_crew.jpeg`). On dark surfaces the mark sits
on a white circular badge.

## Colour

Brand:

- `primary` `#2563EB` — primary buttons, active navigation, today emphasis
- `primary-hover` `#1E40AF` — hover/pressed brand surfaces
- `primary-container` `#DBEAFE` with `on-primary-container` `#1E3A8A` — brand tints
  (today-column wash, selected states)
- `accent` `#06B6D4` — progress, highlights, brand moments
- `accent-container` `#CFFAFE` with `on-accent-container` `#164E63`

Semantic status (each pairs a `container` background with an `on-container` text tone —
never white text on a tint, never the bright core colour as small text):

- `success` `#15803D` · container `#DCFCE7` · on-container `#14532D` — confirmations,
  assigned/filled states
- `warning` `#D97706` · container `#FEF3C7` · on-container `#78350F` — attention,
  approaching deadlines
- `danger` `#B91C1C` · container `#FEE2E2` · on-container `#7F1D1D` — errors,
  cancellations, dropouts, unfilled gaps

Neutrals:

- `surface` `#F8FAFC` — page background
- `surface-card` `#FFFFFF` — cards, nav bar, grid cells
- `surface-alt` `#F1F5F9` — grouped/inset sections (toolbars, banner panels, table heads)
- `surface-border` `#E2E8F0` — 1px borders and dividers
- `text-main` `#0F172A` — headings and primary text
- `text-secondary` `#334155` — supporting text, inactive nav
- `text-muted` `#64748B` — captions, metadata; the lightest permitted text tone

Rules: colour is **action and state, not decoration** — a screen at rest is slate text on
white and `surface`, with blue only on the primary action, the active nav item, and the
today marker. Status colours always pair container + on-container + icon + text label,
never colour alone. White text sits only on `primary`, `primary-hover`, and the semantic
`DEFAULT` colours, never on containers or `accent`.

## Typography

**Inter** (weights 400–900) for display, headings, and body; **Public Sans** (400–700)
for labels — the uppercase, letter-spaced micro-labels on table headers, eyebrows, and
status chips. Fallback system sans. Scale:

- Display 32/38, weight 800 — screen-level numbers, hero states
- Title 30/36, weight 700 — page titles
- Heading 18/24, weight 600–700 — card titles, section heads
- Body 16/24, weight 400 — default
- Caption 13/18, weight 500 — metadata, helper text
- Label (Public Sans) 11–12/16, weight 700, uppercase, wide tracking — eyebrows, table
  headers, chip text

Prices, pay amounts, times, and counts use **tabular numerals**. Copy in both languages uses
short sentences, familiar words, no idioms, and numerals for times and pay (ESL, phone-only
users). `en-AU` follows Australian spelling. `pt-BR` is natural Brazilian Portuguese, not a
word-for-word translation of the English catalogue.

## Shape, depth, spacing

- Radius: buttons and inputs 8px, cards and panels 12px, feature panels 16px, chips in
  page headers fully rounded (pill), compact chips inside dense grids 4px.
- Two shadow levels only: `sm` `0 1px 2px 0 rgb(0 0 0 / 0.05)` for nav, toolbars, and
  chips-on-cards; `card` `0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 /
  0.05)` for cards and floating surfaces. Everything still carries a 1px
  `surface-border`; shadows soften, borders define.
- 8pt spacing grid; card padding 16px; section gaps 32px.

## Components

- **Buttons**: 8px radius, medium-weight label, height 44px (52px for primary mobile
  actions). Primary = `primary` fill, white text, `primary-hover` on hover. Secondary =
  `surface-card` fill, 1px `surface-border`, `text-secondary` label. Ghost = text only.
  Danger = `danger` fill. Press feedback: scale 0.95. Busy state: inline spinner. One
  primary action per screen.
- **Cards**: 12px radius, 16px padding, `surface-card` fill, 1px `surface-border`,
  `card` shadow. Inset/grouped panels use `surface-alt`.
- **Inputs**: 48px height, 8px radius, `surface-border` border, caption-size label
  above, focus = `primary` border + soft ring, error = `danger` border + caption message
  below.
- **Status chips**: container background + on-container text + icon + word (e.g. posted,
  assigned, in progress, done, gap), Public Sans label style. Pill in page headers,
  4px radius compact form inside dense grids. Never colour without a word.
- **Segmented controls**: `surface-alt` track with 1px border; the active segment is a
  `surface-card` pill with `sm` shadow and `primary` text.
- **Language control**: available before authentication and in the signed-in settings/profile
  surface. Options use their own-language names — “English (Australia)” and “Português
  (Brasil)” — never flags. Switching language preserves the current task, entered data, route,
  and query parameters.
- **Navigation (CRM top bar)**: `surface-card`, bottom `surface-border`, `sm` shadow;
  active item = `primary` text + 2px `primary` underline; inactive = `text-secondary`.
- **Exception panels** (e.g. vacancies to fill): `surface-alt` panel, danger icon +
  heading, white cards inside, one primary action per card.
- **Today marker** (roster grid): `primary-container` wash on the column, `primary`
  header text, small `primary`-filled "TODAY" tag.
- **Bottom sheets** (mobile): floating card pinned to bottom, drag handle, `card` shadow.
- **Skeletons**: base on `surface-alt` with a `surface-border` shimmer band. Match the stable
  macro-geometry of the content at every breakpoint — outer bounds, toolbar footprint, column
  tracks, row-height class, and reserved persistent regions — rather than promising an exact
  dynamic row count. Loaded and loading variants share local geometry variables. Decorative
  marks are `aria-hidden`; the boundary provides one localised busy announcement and no
  interactive controls. Background revalidation preserves useful loaded content.
- **Bubble loader**: outlined `primary`/`accent` circles rising and swaying; static
  circles under reduced motion.

## Layout

- **Cleaner app (mobile-first PWA, 390px design width)**: single column, bottom-anchored
  primary actions, bottom sheets for detail, thumb-reach first. Screens must survive
  interruption — state is always recoverable.
- **CRM (desktop-first web, 1280px design width, responsive to tablet/mobile)**: sticky
  top nav bar — logo, Roster · Jobs · Clients · Cleaners · Money, with the current section
  marked. Route-specific primary actions appear only once their workflow ships. No dead
  action placeholders. Content max-width 1200px. Dense data (roster week grid, client
  tables) uses label-style headers, body-size cells, generous row height (44px+). The
  roster is the default screen.
- **Translation resilience**: controls and layouts accommodate the longer of the `en-AU` and
  `pt-BR` labels without clipping or hiding actions. Buttons may grow or wrap where necessary;
  text-bearing controls do not depend on a fixed English width. Truncation is reserved for long
  user-authored values and must leave the full value available accessibly.

## Interaction & motion

Motion is functional and brief. The duration scale is `--duration-fast` `150ms` for immediate
feedback, disclosures, press feedback, and exits, and `--duration-standard` `250ms` for routine
entrances and bottom-sheet entry. The easing tokens are `--ease-standard` `cubic-bezier(0.2, 0, 0, 1)`
for entry and state settlement, and `--ease-exit` `cubic-bezier(0.4, 0, 1, 1)` for dismissal.
Duration tokens are regular `:root` custom
properties; easing tokens use Tailwind's `--ease-*` `@theme` namespace.

Interaction grammar:

- Micro-feedback and disclosures use fast + standard. Bottom sheets enter from the bottom with
  standard + standard and exit with fast + exit.
- Finite UI transitions animate transform, opacity, colour, or background colour. Do not animate
  layout-driving properties. Motion is interruptible and never delays focus, interactivity, or
  navigation.
- No sibling staggering or bespoke route choreography. Next.js View Transitions are out of scope
  for the current milestone.
- The bubble loader is the only playful motion. Bubble, spinner, and skeleton-shimmer cycles keep
  component-specific durations rather than joining the finite interaction scale.

Every async action shows busy state on its trigger. Under `prefers-reduced-motion`, both apps
cover elements and pseudo-elements: continuous motion becomes static, press-scale and spatial
movement are removed, and focus and interactivity never wait for animation.

## Accessibility

WCAG 2.2 AA target: 4.5:1 text contrast. `text-muted` `#64748B` is the floor for body and
caption text on `surface-card` and `surface` (≈4.7:1 on white); nothing lighter carries
text. On-container tones are the only text colours on status tints. White text only on
`primary`, `primary-hover`, and semantic `DEFAULT` fills. Visible focus rings
(`primary`, soft), 44px minimum touch targets, labels tied to inputs, status conveyed by
text + colour. The document language reflects the active locale (`en-AU` or `pt-BR`) so screen
readers use the correct pronunciation. Language controls have an explicit accessible label in
the active language.

## Content rules

Demo data only in mockups and fixtures — never real client names, addresses, or phone
numbers.

- **Supported languages**: every first-party surface shipped in alpha is complete in `en-AU`
  and `pt-BR`. This includes navigation, authentication, onboarding, forms, helper text,
  validation, errors, status labels, loading and empty states, dialogs, invites, and in-app and
  push notifications. Missing `pt-BR` copy is a release defect, even when an `en-AU` runtime
  fallback prevents a broken screen.
- **Product name**: always **The Clean Crew**. Do not translate, abbreviate, or localise it.
- **Formatting versus operations**: currency remains AUD and schedule time remains
  `Australia/Brisbane` in both languages. Dates, times, numbers, and AUD amounts follow the
  active language's readable conventions; changing language never changes stored values,
  currency, or schedule semantics.
- **User-authored content**: company, client and site names, addresses, access instructions,
  job notes, and field-event notes remain exactly as written. Do not silently translate them.
  Translate the structured labels and status text around them.
- **Message composition**: write complete sentences for each language, including plural and
  variable cases; do not construct visible sentences by joining translated fragments.
- **Terminology**: use the product glossary as the authority for domain concepts. Maintain one
  approved term per concept in each language and avoid unexplained English product jargon in
  `pt-BR`.

## Decision log

- **22 Aug 2026 — Functional motion contract adopted.** Both apps use a 150ms/250ms finite
  interaction scale with named standard and exit easings. Skeletons preserve stable
  macro-geometry through shared local variables and become static under reduced motion. Route
  View Transitions and motion libraries remain out of scope for the current milestone.
- **17 Aug 2026 — Bilingual alpha adopted.** Both apps support `en-AU` and `pt-BR` on every
  shipped alpha surface. Language changes first-party copy and readable formatting, while AUD,
  `Australia/Brisbane`, domain state, and user-authored content remain unchanged. The product
  name is **The Clean Crew** in both languages and is never translated.
- **17 Aug 2026 — Trust Blue adopted.** Chosen from the five research palette directions
  (`docs/research/ux-design.md`; comparison set in `mockups/redesign/`) against Fresh
  Teal, Warm Clean, Burgundy & Teal, and Utility Orange. Reference screen:
  `mockups/redesign/trust-blue-approved.html`. Carried over from the research: the
  80/15/5 neutral/brand/semantic split, container/on-container status pairs, icon + word
  status semantics, tabular numerals. Supersedes the prototype-seeded ink-on-paper
  system (Poppins, pill buttons, single shadow level); the soap-bubble motif is retained
  in brand blue/cyan.
