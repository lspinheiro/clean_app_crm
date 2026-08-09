# Clean App — Design System

The single visual world for both apps (`apps/crm`, `apps/cleaner`). Canonical: the Stitch
design system is derived from this file (`upload_design_md`), never edited in Stitch.
Seeded from the `../clean-app` prototype's tokens (Design System v3.1); the cleaner app's
parity screens keep visual fidelity to the prototype.

## Point of view

Uber-like utility: **ink on paper, high contrast, strong type, colour only for state.**
The interface is a tool used one-handed between site visits — quiet surfaces, decisive
typography, zero decoration that isn't information. The one brand motif is the soap
bubble (outlined circles, motion makes them read as bubbles); it appears in loaders and
empty states, never as background decoration.

## Colour

Core:

- `ink` `#000000` — text, primary buttons, emphasis surfaces
- `paper` `#ffffff` — background
- `bubble` `#00c2ff` — the "clean" accent: progress, highlights, brand moments
- `success` `#06c167` — confirmations, filled/assigned states
- `danger` `#e11900` — errors, cancellations, dropouts, unfilled-gap alerts

Neutral scale (surfaces, borders, secondary text): gray-50 `#fafafa`, gray-100 `#f5f5f5`,
gray-200 `#e8e8e8`, gray-300 `#d6d6d6`, gray-400 `#a8a8a8`, gray-500 `#7a7a7a`,
gray-600 `#545454`, gray-700 `#3d3d3d`, gray-800 `#262626`, gray-900 `#141414`.

Rules: colour is **state, not decoration** — a screen at rest is black, white, and grey.
`bubble` is never a text colour on white (contrast); use it for fills, bars, and accents
beside ink text. Status colours always pair with a text label, never colour alone.

## Typography

**Poppins** (weights 400–800), fallback system sans. Scale:

- Display 32/38, weight 800 — screen-level numbers, hero states
- Title 24/30, weight 700 — page titles
- Heading 18/24, weight 700 — card titles, section heads
- Body 16/24, weight 400 — default
- Caption 13/18, weight 400–500 — labels, metadata, table headers

Prices, pay amounts, times, and counts use **tabular numerals**. UI copy is plain
English: short sentences, no idioms, numerals for times and pay (ESL, phone-only users).

## Shape, depth, spacing

- Radius: inputs 8px, cards 12px, buttons and chips fully rounded (pill).
- One shadow level only: `0 4px 16px rgb(0 0 0 / 0.08)` for floating cards and bottom
  sheets. Everything else is flat with `gray-200` 1px borders.
- 8pt spacing grid; card padding 16px.

## Components

- **Buttons**: pill, bold label, height 44/52px. Primary = ink fill, paper text.
  Secondary = 1px gray-300 border, ink text. Ghost = text only. Danger = danger fill.
  Press feedback: scale 0.98. Busy state: inline spinner. One primary action per screen.
- **Cards**: 12px radius, 16px padding. Paper tone (border) by default; ink tone
  (inverted) for emphasis moments; floating (shadow) for overlays.
- **Inputs**: 48px height, 8px radius, gray-300 border, caption-size label above, focus =
  ink border + soft ring, error = danger border + caption message below.
- **Status chips**: pill, caption size, tinted background + label (e.g. posted, assigned,
  in progress, done, gap). Never colour without a word.
- **Bottom sheets** (mobile): floating card pinned to bottom, drag handle.
- **Skeletons**: shimmer on gray-100/200; respect reduced motion.
- **Bubble loader**: outlined ink/bubble circles rising and swaying; static circles under
  reduced motion.

## Layout

- **Cleaner app (mobile-first PWA, 390px design width)**: single column, bottom-anchored
  primary actions, bottom sheets for detail, thumb-reach first. Screens must survive
  interruption — state is always recoverable.
- **CRM (desktop-first web, 1280px design width, responsive to tablet/mobile)**: top nav
  bar — logo, Roster · Jobs · Clients · Pool · Money, primary "+ New job" button right.
  Content max-width 1200px. Dense data (roster week grid, client tables) uses
  caption-size headers, body-size cells, generous row height (44px+). The roster is the
  default screen.

## Interaction & motion

Motion is functional and brief (150ms transforms, 200–300ms sheets); the bubble loader is
the only playful motion. Every async action shows busy state on its trigger. Respect
`prefers-reduced-motion` everywhere.

## Accessibility

WCAG 2.2 AA target: 4.5:1 text contrast (ink on paper clears it; grey text no lighter
than gray-600 for body and caption text on white or gray-50 — gray-500 is 4.29:1 on
white, under AA at caption sizes, so it is reserved for large text and non-text glyphs
where 3:1 applies), visible focus rings (ink, soft), 44px minimum touch targets, labels
tied to inputs, status conveyed by text + colour.

## Content rules

Demo data only in mockups and fixtures — never real client names, addresses, or phone
numbers. Currency AUD (`$180`), times as `8:00`, dates as `Tue 12 Aug`. Working name in
UI: **Clean App**.
