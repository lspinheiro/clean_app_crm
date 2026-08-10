---
target: CA-1 roster week view (apps/crm /roster)
total_score: 25
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
timestamp: 2026-08-09T22-48-18Z
slug: apps-crm-src-app-crm-roster-roster-week-tsx
---
Method: dual-agent (A: design-review sub-agent · B: detector-evidence sub-agent)

Evidence: live authenticated captures (Playwright, demo admin) of desktop 1280×800 and mobile 390×844 — by-cleaner gap week (17 Aug), by-site pivot (17 Aug), far-future clear week (14 Sept), current week (10 Aug); focus-report (8 tab stops); detector runs on source and all six rendered states. An initial capture set was stale (navigation race); Assessment A re-reviewed the corrected, checksum-verified set before finalising. Captures taken in dev mode (Next.js badge visible; not product UI).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No today marker; green "0 unfilled slots" over an ungenerated beyond-horizon week is actively wrong |
| 2 | Match System / Real World | 3 | "Vacancy view" sub-label leaks the internal projection model (decision 0003) |
| 3 | User Control and Freedom | 3 | URL-driven week/pivot (back/refresh/share work); no "back to this week" escape |
| 4 | Consistency and Standards | 3 | Cell type 11–12px below the system's own 13px caption floor; `+ New job` is a span faking a button |
| 5 | Error Prevention | 2 | False green all-clear invites the costliest misread; "Week of 10 Aug" carries no year |
| 6 | Recognition Rather Than Recall | 3 | Sticky first column preserves row identity; mobile gap-hunt still runs on memory |
| 7 | Flexibility and Efficiency | 2 | ±1-week stepping only; no today shortcut, date jump, keyboard nav; gaps not clickable |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, state-only colour; fixed footer duplicates the count; sparse weeks are em-dash fields |
| 9 | Error Recovery | 2 | Empty states route well; the sharpest problem state (a gap) has zero recovery affordance |
| 10 | Help and Documentation | 2 | Good microcopy; nothing explains the 28-day generation horizon — the concept whose absence produces the false all-clear |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

Domain-authored information architecture wearing category-generic clothes. The bones are unmistakably a cleaning-ops roster: cleaner/site pivots, "slot 2 of 2" crew-slot language, vacancy row pinned above the cleaners, Brisbane times, "Offer to pool" as the future verb. But the rendering is interchangeable — no visual encoding of time-of-day (a 6:00 clinic clean and a 22:15 towers clean render identically), no crew identity, brand motif only in the empty state. A correct roster; not yet a tool that feels built for this trade.

**Deterministic scan:** 0 anti-patterns on source (roster route + layout) and on all six rendered states at both viewports. One advisory (`em-dash-overuse`, 22 em-dashes) on every state — confirmed false positive: the `roster-no-work` empty-cell placeholders, not prose. The clean scans corroborate the token discipline the design review praised; the advisory accidentally points at a real observation made independently — most grid cells are empty dashes.

**Visual overlays:** browser extension blocked for localhost; rendered-HTML URL-mode scans used as the fallback signal.

## Overall Impression

Desktop answers Thiago's question — "what needs covering this week?" — in under a second, with rare visual discipline. But the surface is read-only at its emotional peak (gaps are inert), actively misleading beyond the 28-day horizon (green all-clear over ungenerated weeks), and the phone — the primary device — is a 390px keyhole onto a 960px desktop table. Biggest opportunity: make the gap an actionable object.

## What's Working

1. **Gap-finding on desktop is a sub-second scan** — vacancy row pinned first (model.ts:136–157), red-only-for-gaps discipline, warning triangle + "GAP" word (never colour alone) — DESIGN.md's "colour is state" embodied.
2. **URL-first, server-rendered state** — week/pivot in query params; back/forward/refresh/paste-into-WhatsApp all work; skeleton mirrors final grid geometry.
3. **Honest, situated edge copy** — "Build your roster foundation" → "Go to clients"; each empty state names its own remedy.

## Priority Issues

1. **[P1] Gaps are dead ends.** Gap and job entries are non-interactive divs (roster-week.tsx:31–47); no job-detail route exists; the only action on the page is disabled. Thiago sees the gap and must leave the app to act. Fix: make every gap (and job) entry a link to the parity job-detail/dispatch surface, or interim to /jobs anchored at the job. Command: **clarify**.
2. **[P1] False all-clear beyond the generation horizon.** `vacancyCount === 0` triggers green `is-clear` regardless of whether any jobs exist (roster-week.tsx:109–113, 183–191); Week of 14 Sept renders green "0 unfilled slots" over an ungenerated week (verified visually). Fix: branch on zero jobs — neutral state, honest copy ("Nothing scheduled this week yet — recurring jobs are generated 4 weeks ahead"); reserve green for "N jobs, all covered". Command: **harden**.
3. **[P1] Mobile is a 390px keyhole onto a 960px table.** Sticky label column consumes ~52% of the viewport; one day visible; no scroll-snap; by-site adds a second axis through 9 mostly-empty rows. The primary persona is one-handed on a phone. Fix: below ~700px re-form into a stacked day agenda (gaps first within each day), grid for tablet up. Command: **adapt**.
4. **[P2] Fixed footer spends prime space on redundancy plus an apology.** Duplicates the header count next to a permanently disabled button; costs 80–110px every viewport, 184px bottom padding on phones — the thumb zone occupied by the one element that does nothing. Fix: remove until "Offer to pool" ships; if a bar exists, show only when gaps > 0 and give it the gap action. Command: **distill**.
5. **[P2] No temporal anchor.** Today's column is unmarked, the heading reads "Week of 10 Aug" whether current or twelve weeks out, and returning to now means chevron-clicking until the numbers look right. Fix: highlight today's column header; show a "This week" return control when weekStart ≠ current. Command: **polish**.

## Persona Red Flags

**Alex (power user):** gap/job entries not clickable — every investigation detours through /jobs with manual re-finding; ±1-week chevrons only (horizon check = 4 page loads); no keyboard shortcuts; will try to click the gap-count pill — nothing happens; by-site pivot is 7/9 rows of pure dashes with no "hide empty rows".
**Sam (screen reader/keyboard):** 8 Tabs to reach the first roster control; no skip link in the DOM; `+ New job` span invisible to Tab and role-less; `roster-no-work` aria-label on a static span unreliable across SR pairs (a sparse week reads as ~21 bare em-dashes); `<title>` is "Clean App" for every week and pivot — the route announcer has nothing to announce. Positive: visible 2px outline on all 8 stops; real table semantics with scope attributes; focusable labelled scroll region.
**Thiago on the phone:** week/pivot controls 230–310px from the top, thumb zone holds the disabled button; no scroll-snap — interruption mid-pan loses his place (URL state survives, scroll state doesn't); site names truncate to "Broadbeach …"; the third gap sits ~570px off-screen with only the count pill hinting it exists.

## Minor Observations

- By-site cells encode an unfilled job twice: "6:00 / No cleaners assigned" entry plus "GAP 6:00 slot 1 of 1" entry (Palm Grove, Thu 20) — one fact, two chips.
- Cell typography 11–12px below DESIGN.md's 13px caption floor; eyebrow gray-500 on gray-50 ≈ 4.2:1 — marginal AA fail at 12px (typeset).
- Dead CSS: `.roster-gap-row th` tint (globals.css:1793–1800) out-specified by `.roster-grid tbody th` (1769–1774) — intended row-header tint never renders.
- Pre-onboarding empty state renders the green "0 unfilled slots" pill above "Build your roster foundation" (pill unconditional, roster-week.tsx:108–114).
- By-site pivot renders duplicate same-name sites indistinguishably ("Harbour North" ×2 in live data) — no client/address disambiguation.
- "Week of 10 Aug" no year; ambiguous in shared URLs near year boundaries.
- Southport Office empty in week 17 despite a Tuesday recurring job in week 10 — UI cannot distinguish "no work scheduled" from "generation produced no instance"; structural ambiguity.
- Crew jobs say "2 cleaners" but never name the partner; answering "who's with her?" requires a pivot switch.
- Cleaner rows sort purely alphabetically; no activity-first ordering — at ~12 cleaners the grid is mostly dashes.
- `completed` jobs render identically to scheduled ones mid-week (visibleJobStatuses includes completed).
- "Unavailable cleaner" fallback (model.ts:52) reads as a person's status, not a data condition.
- Loading skeleton omits gap pill and footer → shift when they mount.
- Captures taken in dev mode; re-capture in production mode for future reviews.

## Questions to Consider

1. Is the week-grid the right atom on a phone at all? His phone question is "who's on today, and what's the next uncovered slot?" — a surface answering exactly that, with the grid one tap away, would be the first thing his spreadsheet can't do.
2. Should a gap carry its own remedy? Each vacancy knows its site, time, and the site's ordered preferred cleaners — "Preferred: Ana, Marcus" on the gap entry turns the roster from report into dispatch queue.
3. Can the system ever honestly say "0 unfilled slots" about the future? Assert what it knows — "All 6 scheduled jobs covered" — so the count of positives replaces the assertion of absence.
