---
target: "http://127.0.0.1:3001/board"
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-22T04-48-55Z
slug: apps-cleaner-src-app-cleaner-board-page-tsx
---
Method: dual-agent (A: /root/critique_a · B: /root/critique_b)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Busy, waiting, error, and active-nav states exist; successful application is not explicitly announced and load recovery is weak. |
| 2 | Match System / Real World | 3 | Job facts use familiar language, but “Board” and “Apply” do not fully explain the real-world commitment. |
| 3 | User Control and Freedom | 3 | Withdraw, navigation, and sign-out provide useful escape routes. |
| 4 | Consistency and Standards | 2 | The live board is internally coherent but conflicts with the canonical Trust Blue and bilingual contracts. |
| 5 | Error Prevention | 2 | Privacy gating is strong, but the application decision lacks enough expectation-setting. |
| 6 | Recognition Rather Than Recall | 2 | Card facts are co-located, but the unlabeled open-jobs transition and generic “Board” label make state distinctions less discoverable. |
| 7 | Flexibility and Efficiency | 2 | One-tap applications are fast; longer lists have no visible grouping or refresh affordance. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained and readable, but repeated black CTA bars flatten hierarchy and feel category-generic. |
| 9 | Error Recovery | 3 | Errors are local and plain-language; the board-load failure has no direct Retry action. |
| 10 | Help and Documentation | 1 | No contextual explanation says what Apply commits to or what happens next. |
| **Total** |  | **24/40** | **Acceptable — significant improvements needed.** |

## Design Specificity Verdict

**LLM assessment:** Low specificity, **2/5**. The content model is clearly for cleaning work—company, date/time, site/suburb, service, duration, pay—but the Poppins/black/pill presentation could be reused unchanged for delivery, hospitality shifts, or a general gig marketplace. The live UI still expresses the superseded prototype world instead of the canonical Trust Blue system.

**Deterministic scan:** The bundled detector returned `[]` with exit code 0 for both `apps/cleaner/src/app/(cleaner)/board/page.tsx` and `apps/cleaner/src/app/(cleaner)/board/vacancy-card.tsx`: **0 findings, 0 rules, 0 false positives**. This supports the semantic foundation but cannot detect product-contract drift, missing localisation, or the rendered hierarchy issue.

**Visual evidence:** Authenticated desktop and mobile inspection succeeded. The overlay preflight did not: browser security policy blocked the mutable `javascript:` action before title or script mutation. No detector server was started, no script was injected, and no reliable user-visible overlay is available. The fallback was authenticated DOM inspection, screenshots, and geometry measurements at 1440×900/1280×800 desktop and 390×844 mobile.

## Overall Impression

The board is fast, legible, and fundamentally usable. Its strongest quality is restraint: Ana can understand a vacancy and act in seconds. Its biggest opportunity is not more decoration; it is to turn a generic prototype list into a trustworthy, bilingual work surface with explicit state boundaries and commitment reassurance.

## What’s Working

1. **Fast core decision.** Time and pay lead, and the full-width 44px action makes the one-tap promise credible on mobile.
2. **Privacy-aware information design.** Before assignment, the board exposes site name and suburb while withholding address, access notes, client phone, and client charge.
3. **Sound semantic and responsive foundations.** Headings, labelled lists, real buttons, labelled navigation, alerts, visible focus, no horizontal overflow, and persisted application state support accessibility and interruption recovery. The detector found no markup anti-patterns.

## Priority Issues

### 1. P1 — The board ships the discarded visual world

- **Why it matters:** The Poppins typography, black primary buttons, and extreme pill shapes make the product feel like a functional prototype rather than a trusted cross-company work home. They also break visual consistency with the CRM and canonical design contract.
- **Evidence:** `apps/cleaner/src/app/globals.css:3`, `apps/cleaner/src/app/layout.tsx:6`, and `DESIGN.md:3`.
- **Fix:** Migrate the board shell, cards, primary/active states, typography, shape, and loading/empty brand moments to Trust Blue tokens. Keep colour disciplined: action and state, not decoration.
- **Suggested command:** `$impeccable colorize`, then `$impeccable typeset`.

### 2. P1 — The bilingual alpha contract is absent

- **Why it matters:** Brazilian Portuguese cleaners cannot operate this core surface in their selected language; document pronunciation and longer-label resilience also remain unverified.
- **Evidence:** The document language is hard-coded to `en-AU` in `apps/cleaner/src/app/layout.tsx:52`; navigation, board states, and card actions are hard-coded English in `page.tsx:173` and `vacancy-card.tsx:43`. `DESIGN.md:189` defines missing pt-BR copy as a release defect.
- **Fix:** Route all structured copy and formatting through the locale contract, set document language dynamically, and expose the signed-in language control while preserving route and task state.
- **Suggested command:** `$impeccable adapt`.

### 3. P2 — Apply does not explain the commitment or next step

- **Why it matters:** A first-time or ESL user may read Apply as accepting the job, or assume “Waiting to hear back” means assigned work is pending.
- **Evidence:** The CTA is “Apply” and the post-action state is only “Waiting to hear back” in `vacancy-card.tsx:43`; the success text is a plain span rather than an announced status.
- **Fix:** Use explicit short copy: “Apply for job,” followed by “Applied — the company will confirm. You are not assigned yet.” Announce the state transition while retaining Withdraw.
- **Suggested command:** `$impeccable clarify`.

### 4. P2 — Applied and open work lack a visible structural boundary

- **Why it matters:** In the authenticated applied state, the open list has an accessible name but no visible heading. Users scanning quickly can mistake the next card for another applied job.
- **Evidence:** The live mobile state showed an “Applied” heading and card followed immediately by open cards; `page.tsx:216` supplies `aria-label="Open jobs"` without an equivalent visible section title.
- **Fix:** Add a visible “Open jobs” heading with a count and quiet spacing/divider treatment. Keep the accessible label aligned with the visible name.
- **Suggested command:** `$impeccable layout`.

### 5. P2 — Loading, error, and empty states do not sustain trust

- **Why it matters:** Slow connections feel stalled, recoverable failures require reopening the app, and an empty board feels like a dead end.
- **Evidence:** `page.tsx:190` renders a plain loading paragraph, a load failure without Retry, and passive empty copy. `DESIGN.md:123` requires geometry-preserving skeletons and reserves the bubble motif for loaders and empty states.
- **Fix:** Add stable vacancy-card skeletons, a direct Retry action, and a restrained bubble-branded empty state explaining that joined companies will post vacancies here.
- **Suggested command:** `$impeccable harden`.

## Persona Red Flags

**Ana / Casey — distracted, phone-only cleaner:** Full-width actions, 44px touch height, no horizontal overflow, and sticky navigation are strong. The applied/open boundary is weak, and commitment copy does not provide enough reassurance when she is scanning between jobs and interruptions.

**Jordan — first-timer:** “Board” and “Apply” assume product knowledge. Nothing clearly says that applying is not assignment or explains what the company will do next.

**Sam — accessibility-dependent:** Semantic lists, buttons, alerts, and focus treatments are solid. The successful application transition lacks a live announcement, and hard-coded `en-AU` prevents correct pt-BR screen-reader pronunciation.

## Cognitive Load

**1 failure of 8 — low current load, with scaling risk.** Single focus, chunking, grouping inside cards, one-at-a-time actions, minimal per-card choices, and progressive privacy disclosure pass. Visual hierarchy fails in the applied state because the open list lacks a visible section boundary. Demo accounts exposed four to eight vacancies; once the list grows, equal-weight cards and CTAs will need time-based chunking to keep comparison manageable.

## Emotional Journey

- **Arrival:** Immediately understandable, but anonymous and prototype-like; it does not strongly signal a trusted private work board.
- **Scanning:** Pay and time reassure, while repeated identical cards create monotony rather than momentum.
- **Commitment:** Fast but ambiguous—interest and acceptance are not clearly distinguished.
- **After action:** Withdraw restores control, but “not assigned yet” is not explicit or assistively announced.
- **Low-connectivity/empty moments:** Plain loading, passive empty copy, and “open the app again” form the emotional valley.
- **Peak/end:** Pay plus one-tap application is the peak; the confirmation state is not strong enough to become the reassuring end.

## Minor Observations

- **P3:** At desktop widths, the board correctly stays phone-like, but bottom navigation spans the full viewport while the task column remains about 327–359px wide.
- **P3:** The 24px page title is smaller than the canonical 30px title scale.
- **P3:** The thin active-nav cyan line is the only visible brand colour; there is no product mark or restrained brand moment.
- **P3:** Sign out appears after the vacancy feed; Profile/Settings would be a more natural home once that surface exists.
- Source states cover busy, error, waiting, and closed vacancies, but there is no visible refresh affordance or offline reassurance.

## Questions to Consider

- Is Apply merely “I’m interested,” or a commitment Ana may rearrange her week around? Does the interface state that distinction strongly enough?
- What visible boundary should let Ana distinguish applied work from open work in one glance?
- Should the next pass fully bring this surface into Trust Blue, or make the smallest board-only corrections first?
- If the black buttons and cleaning data were replaced with another industry’s content, what would still identify The Clean Crew?
