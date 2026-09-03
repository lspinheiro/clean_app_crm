# Main Red Gates Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return `pnpm check` and both acceptance suites to green on `main`, so a branch merge can demonstrate a green gate instead of inheriting four red ones.

**Architecture:** Four independent repairs, each its own commit on `main`. Three are test-infrastructure defects (a fixture that collides with the seed calendar, a missing vitest timeout, a Windows-only upstream Next bug); the fourth is an investigation that ends in either a note or a one-line budget change. No production code changes anywhere in this plan.

**Tech Stack:** pnpm workspace monorepo · pgTAP over local Supabase Postgres · vitest + Testing Library · Playwright.

**Spec:** No design doc. This plan implements the decision brief produced by the 2026-09-03 diagnosis of four pre-existing failures on `main` (`cd67a1e`), recorded in the conversation that created this file. Each task below restates the finding it acts on, so the plan is self-contained.

## Global Constraints

- Prose in docs and test descriptions is en-GB / Australian spelling; never respell code identifiers.
- No production behaviour changes in this plan. If a task appears to need one, stop and report — it belongs to the separate `accept_offer` work (see Out of Scope).
- Each task is its own commit on the `dottoleao/main-red-gates` branch, which merges to `main`. Do not bundle tasks together, and do not bundle any of them into the CLE-111 branch (`dottoleao/cle-111-posting-preview-company-id`, commit `58f9c7b`).
- Never weaken, delete, skip or broadly mock a test to reach green. Where a task narrows an assertion's scope, it must state why in a code comment and keep every other assertion live.
- Commit messages carry no AI attribution of any kind — no `Co-Authored-By`, no session trailer, no "generated with" note.
- The local Supabase stack must be running (`docker ps` shows `supabase_db_clean_app_crm`). Timezone for every date calculation is `Australia/Brisbane`.

## Out of Scope

A **P1 product defect** was found while diagnosing Task 1 and is deliberately excluded: `accept_offer` (`packages/db/supabase/migrations/20260829092000_cle_52_series_offers.sql:917-940`) wraps series reconciliation in `begin … exception when others`, so a single overlapping instance raises 23P01 against the `job_assignments_no_cleaner_overlap` GiST exclusion, the whole reconcile rolls back, and the RPC still reports success — the cleaner's consent is recorded while she is rostered onto nothing. That is an RPC on a product-law surface (consent and rostering) and needs its own design decision between an anti-join on the exclusion predicate and per-instance savepoints. **Task 1 adds a canary for it; the canary is not coverage.** Now tracked as CLE-112.

---

## File Structure

| File | Change | Responsibility after the change |
| --- | --- | --- |
| `packages/db/supabase/tests/cle_52_series_offers.test.sql` | Modify line 684; insert a probe after line 727 | Fixture no longer collides with the seed calendar; a new assertion fails loudly if the double_reserved rule's acceptance ever swallows a generation failure |
| `apps/cleaner/vitest.config.ts` | Modify the `test` block | Carries the same timeout budget the CRM app already documents |
| `apps/crm/tests/acceptance/cle-42-performance.spec.ts` | Modify the final assertion | Font-preload tag asserted on the platforms where Next can emit it; the other eight assertions stay live everywhere |
| `apps/crm/tests/acceptance/f15-crm-i18n.spec.ts` | Modify line 50, only if Task 4's measurement says so | Budget matched to the suite's real cost, or left alone with a recorded reason |

---

## Task 1: Un-collide the `cle_52` series fixture and add the swallow canary

**The finding.** `packages/db/supabase/tests/cle_52_series_offers.test.sql` TAP 46, 48 and 49 fail with `have: 2, want: 1`. The `double_reserved` fixture (line 684) hard-codes a Friday **13:00–14:00** slot for cleaner `…0002`. The seed's demo jobs are pinned to **12:00 Brisbane** on `today+1` (120 min), `today+2` (90 min) and `today+3` (60 min), with cleaners `…0002` and `…0003` assigned (`packages/db/supabase/seed.sql:660-717`). The seed also calls `generate_recurring_jobs()` (`seed.sql:446`), which creates further assignments for the same cleaner inside the horizon; none of the three seeded rules produces a Friday job for `…0002`, so 15:00 stays clear of those too. When the fixture's generated Friday lands on one of those, the roster insert inside `reconcile_recurring_assignment_jobs` raises 23P01 against the non-deferrable GiST exclusion `job_assignments_no_cleaner_overlap` — which `on conflict (job_id, slot_number)` cannot absorb, because a conflict target only arbitrates a unique index. `accept_offer` swallows it, nobody is rostered, and the job keeps 3 free slots minus 1 reservation = 2.

**The `vacancies` view is correct and the test's expectation is correct.** Only the fixture's time of day is wrong. The structurally identical `assigned_named` block at line 562 passes solely because it starts at 11:00.

**This is not a one-off.** Generation runs from `greatest(local_today, anchor_date)` forward 28 days filtered to weekday 5, so the fixture keeps producing "the next Friday" indefinitely. It collides **every Wednesday** (`today+2`, 12:00–13:30) and **every Thursday** (`today+1`, 12:00–14:00) — two days in seven, including the 07:17 UTC daily release cron, which is 17:17 Brisbane on the same date.

**Files:**
- Modify: `packages/db/supabase/tests/cle_52_series_offers.test.sql:684`
- Modify: `packages/db/supabase/tests/cle_52_series_offers.test.sql` — insert a new assertion after the existing one that ends at line 727

**Interfaces:**
- Consumes: the file's existing temp tables `cle_52_rule_ids(label, rule_id)` and `cle_52_job_ids(label, job_id)`, and `public.recurring_generation_failures(recurring_assignment_id, failed_at, error_code, error_message)`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Prove the collision exists, independently of today's weekday**

The suite only goes red on a Wednesday or Thursday, so a plain `pnpm db:test` is not a reliable RED. Run this read-only probe instead — it reports whether any assignment already held by cleaner `…0002` overlaps a Friday 13:00–14:00 window in the generation horizon, and whether 15:00–16:00 would be clear.

```bash
docker exec supabase_db_clean_app_crm psql -U postgres -d postgres -c "
with days as (
  select generate_series(
           timezone('Australia/Brisbane', now())::date,
           timezone('Australia/Brisbane', now())::date + 27,
           interval '1 day')::date as d
), fridays as (select d from days where extract(isodow from d) = 5),
booked as (
  select job.scheduled_start as s,
         job.scheduled_start + make_interval(mins => job.duration_minutes) as e
  from public.jobs job
  join public.job_assignments a on a.job_id = job.id and a.unassigned_at is null
  where a.cleaner_id = '10000000-0000-4000-8000-000000000002'
)
select
  count(*) filter (where tstzrange(booked.s, booked.e, '[)') && tstzrange(
    (fridays.d + time '13:00') at time zone 'Australia/Brisbane',
    (fridays.d + time '14:00') at time zone 'Australia/Brisbane', '[)')) as collides_at_1300,
  count(*) filter (where tstzrange(booked.s, booked.e, '[)') && tstzrange(
    (fridays.d + time '15:00') at time zone 'Australia/Brisbane',
    (fridays.d + time '16:00') at time zone 'Australia/Brisbane', '[)')) as collides_at_1500
from fridays cross join booked;"
```

Expected: `collides_at_1300` is 1 or more and `collides_at_1500` is 0. If `collides_at_1300` is 0, the database was not reset from the current seed — run `pnpm db:reset` and try again before continuing.

- [ ] **Step 2: Record the current suite result for comparison**

```bash
pnpm db:reset && pnpm db:test
```

Note which TAP numbers fail. On a Wednesday or Thursday this shows `cle_52_series_offers.test.sql … Failed: 3` (tests 46, 48, 49). On any other weekday the file already passes — that is expected, and Step 1 is your RED evidence instead. Any *other* failing file is out of this task's scope; record it and carry on.

- [ ] **Step 3: Move the fixture clear of the seed's midday band**

In `packages/db/supabase/tests/cle_52_series_offers.test.sql`, line 684 currently reads:

```sql
  'weekly', 5::smallint, '2026-09-04', '13:00', 60, 9000, 3,
```

Change it to:

```sql
  'weekly', 5::smallint, '2026-09-04', '15:00', 60, 9000, 3,
```

15:00 is chosen because the seed's demo jobs all start at 12:00 Brisbane and run at most 120 minutes, so they can never reach past 14:00; and because 15:00 is unused by every other rule in this file (03:00, 05:00, 06:00, 07:00, 09:00, 11:00, 13:00). The assertion semantics are unchanged: crew 3, two named cleaners, one accepts, one reservation remains.

- [ ] **Step 4: Add the canary that keeps the swallowed failure visible**

Moving the fixture makes the gate green and, on its own, removes the only signal in the repository that would ever surface the P1 described in **Out of Scope**. Add this assertion immediately after the existing `select is(...)` block that ends at line 727 (the one titled `'one unconsented named cleaner reserves one of the two open slots'`), before the `set local role authenticated;` that follows it:

```sql
-- A swallowed 23P01 inside accept_offer's exception block leaves the cleaner rostered on
-- nothing while the RPC still reports success, and the fixture above is the only place in
-- the suite that would ever provoke it. Assert the failure log stays empty, and surface the
-- SQLSTATE when it does not, so the next collision is diagnosed rather than rediscovered.
select is(
  (
    select failure.error_code
    from public.recurring_generation_failures failure
    where failure.recurring_assignment_id = (
      select rule_id from cle_52_rule_ids where label = 'double_reserved'
    )
  ),
  null::text,
  'accepting the series rosters cleanly, with no swallowed generation failure'
);
```

- [ ] **Step 5: Verify the file is green and the canary is live**

```bash
pnpm db:reset && pnpm db:test
```

Expected: `cle_52_series_offers.test.sql … ok`, with its test count one higher than in Step 2. Re-run the Step 1 probe: `collides_at_1500` must still be 0.

To confirm the canary actually guards something rather than passing vacuously, temporarily revert line 684 to `'13:00'`, run `pnpm db:reset && pnpm db:test`, and check that the new assertion fails with `have: 23P01`. Then restore `'15:00'` and re-run. Do not commit the temporary revert.

- [ ] **Step 6: Commit**

```bash
git add packages/db/supabase/tests/cle_52_series_offers.test.sql
git commit -m "test(db): move the double-reserved fixture clear of the seed's midday jobs

The double_reserved rule booked cleaner ...0002 into Friday 13:00-14:00 while
the seed pins its demo jobs to 12:00 Brisbane for up to 120 minutes with the
same cleaner assigned. Whenever the generated Friday landed on one of those --
every Wednesday and every Thursday, the daily release cron included -- the
roster insert inside reconcile_recurring_assignment_jobs raised 23P01 against
the job_assignments_no_cleaner_overlap exclusion, which on conflict cannot
absorb because a conflict target only arbitrates a unique index. accept_offer
swallowed it, nobody was rostered, and the job kept two open slots against the
expected one.

The vacancies view and the assertion were both right; only the fixture's time
of day was wrong. 15:00 clears the seed band, which can never reach past 14:00,
and is unused by every other rule in the file.

Moving it would also delete the only signal in the suite that provokes the
swallow, so the failure log is now asserted empty and reports its SQLSTATE when
it is not. That is a canary, not coverage: the swallow itself needs its own
remediation and its own failing test."
```

---

## Task 2: Give the cleaner app the vitest budget the CRM app already documents

**The finding.** `apps/cleaner/src/app/(localized)/[locale]/join/join-screen.test.tsx` — *"registers before applying to a job-bound posting and sends the optional request note"* — aborts at `Test timed out in 5000ms` when `pnpm test` runs both apps concurrently, and passes when run alone. `apps/cleaner/vitest.config.ts` sets no `testTimeout`, so vitest's 5000 ms default applies. `apps/crm/vitest.config.ts` already sets `testTimeout: 20_000` with a comment describing this exact symptom, added after the same fight.

**`JoinScreen` is not the problem.** All six typed fields are uncontrolled, there is no `onChange`/`onInput` handler, and all four effects carry dependency arrays — a keystroke causes zero re-renders. This is the heaviest userEvent typing test in the monorepo (89 characters across six fields) meeting the wrong budget, not a component regression. Do not modify `JoinScreen`.

**Why not `--workspace-concurrency=1` on the root `"test"` script.** It would remove the cause — two vitest instances each sizing their pool to `availableParallelism()` — but it serialises the CRM's 72 files behind the cleaner's 37 on every run, including CI, in exchange for the same outcome a config line buys for free. The repo reserves that flag for `test:e2e` and `build`, where the contention is over ports and disk rather than cores. Match the documented in-repo precedent instead.

**Files:**
- Modify: `apps/cleaner/vitest.config.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Measure the test's real cost on an idle machine**

The claim that this test "sits just under the boundary" has not actually been measured — 5.03–5.13 s is simply what a 5000 ms abort looks like, not a duration. Establish the real number before changing the budget. Close the dev servers and any other heavy process first.

```bash
pnpm --filter cleaner exec vitest run "src/app/(localized)/[locale]/join/join-screen.test.tsx"
```

Record the reported duration for *"registers before applying to a job-bound posting and sends the optional request note"*.

- Roughly 3–5 s and PASS: the boundary story holds. Continue to Step 2.
- Materially below 3 s: the boundary story is refuted and something else makes it slow only under contention. **Stop and report** — raising the timeout would paper over an unexplained pathology.

- [ ] **Step 2: Reproduce the failure under contention**

```bash
pnpm test
```

Expected: `apps/cleaner test:run` fails with exactly one test, `registers before applying to a job-bound posting and sends the optional request note`, at `Test timed out in 5000ms`. If the whole suite passes, run it twice more — it is contention-dependent. If it never fails, stop and report rather than changing a config to fix something you cannot see.

- [ ] **Step 3: Add the timeout**

In `apps/cleaner/vitest.config.ts`, the `test` block currently reads:

```ts
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    exclude: ["tests/acceptance/**", "node_modules/**", ".next/**"],
  },
```

Change it to:

```ts
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    // Vitest defaults to 5s, which suits a fast unit test and not a jsdom component test
    // driving a form through userEvent. The join registration test types 89 characters
    // across six fields and clears the default on an idle machine only to cross it once
    // both app suites compete for cores under `pnpm test`. Widening the budget weakens no
    // assertion — every expectation still has to come true — and matches apps/crm, which
    // reached the same number after the same fight.
    testTimeout: 20_000,
    exclude: ["tests/acceptance/**", "node_modules/**", ".next/**"],
  },
```

- [ ] **Step 4: Verify the full suite is green**

```bash
pnpm test
```

Expected: both apps pass, exit code 0. Run it a second time to confirm it is not luck.

- [ ] **Step 5: Commit**

```bash
git add apps/cleaner/vitest.config.ts
git commit -m "test(cleaner): give jsdom component tests the timeout budget crm already has

The join registration test types 89 characters across six fields through
userEvent. It clears vitest's 5s default alone and crosses it once `pnpm test`
runs both app suites concurrently and they compete for cores, aborting with
\"Test timed out in 5000ms\" and taking the whole gate with it.

JoinScreen is not at fault: its six typed fields are uncontrolled, it has no
change handler, and all four effects carry dependency arrays, so a keystroke
causes no re-render. The wrong number was the budget.

apps/crm reached testTimeout: 20_000 after the same fight and says so in a
comment; this matches it. Widening a timeout weakens nothing -- every
expectation still has to come true -- and it costs no wall-clock, unlike
serialising the two suites for the same outcome."
```

---

## Task 3: Stop asserting a font-preload tag Next cannot emit on Windows

**The finding.** `apps/crm/tests/acceptance/cle-42-performance.spec.ts` fails on its final assertion, `expect(page.locator('link[rel="preload"][as="font"]')).not.toHaveCount(0)` — received 0. The preceding eight assertions all pass.

The cause is upstream and platform-scoped. Next 16.2.11's `next-font-manifest-plugin.js:60` collects font modules by testing `mod?.request?.includes('/next-font-loader/index.js?')` — forward slash only. On Windows the request is backslashed, because `next/dist/build/webpack-config.js:1080` builds it with `path.join`. Zero modules are collected, the `app` map in `next-font-manifest.json` is empty, `get-preloadable-fonts.js:18` returns `null`, and no preload tag is emitted. Scoped to **Windows + webpack**: ordinary `pnpm crm dev` uses Turbopack and is unaffected, and production HTML is unaffected.

**This gate is green in CI.** `.github/workflows/daily-production.yml:72-73` runs `pnpm test:e2e` on `ubuntu-latest` daily against `main`, under `--webpack`, including this spec. It is red only on Windows development machines.

**Do not drop `--webpack` from `apps/crm/playwright.config.ts:27`.** Production ships webpack (`"build": "next build --webpack"`), so that would move the only real font-manifest signal off the bundler the product is actually built with.

**Do not use `test.skip(process.platform === "win32", …)`.** Called inside a test body it aborts the whole test, discarding the eight assertions that do pass on Windows — the loaded face, the weight, the `font-display: optional` rule, and the successful `.woff2` response. Guard only the final assertion.

**Files:**
- Modify: `apps/crm/tests/acceptance/cle-42-performance.spec.ts` — the final assertion, currently the last line of the test

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Confirm the failure and that only the last assertion fails**

Make sure ports 3100 and 3101 are free first — a leftover server from an interrupted run causes `EADDRINUSE` and masks the real result.

```bash
netstat -ano | grep LISTENING | grep -E ":3100|:3101"
pnpm --filter crm test:e2e -- tests/acceptance/cle-42-performance.spec.ts
```

Expected on Windows: `1 failed`, with `expect(locator).not.toHaveCount(expected)` / `Expected: not 0` / `Received: 0`. The failure must be on the `link[rel="preload"]` line and nothing earlier.

- [ ] **Step 2: Confirm the manifest is empty rather than the page being wrong**

```bash
find apps/crm/.next -name "next-font-manifest.json" -exec echo "--- {}" \; -exec cat {} \;
```

The e2e run in Step 1 starts `next dev --webpack`, which writes this manifest; the exact path varies by Next version, so search rather than assume it. Expected on Windows: the `app` object is empty (`"app":{}`). This is what distinguishes the upstream path-separator bug from a real regression in how the CRM loads its typeface. If `app` has entries, stop and report — the diagnosis does not hold and skipping the assertion would hide a genuine defect.

- [ ] **Step 3: Guard the final assertion by platform**

In `apps/crm/tests/acceptance/cle-42-performance.spec.ts`, the last line of the test currently reads:

```ts
  await expect(page.locator('link[rel="preload"][as="font"]')).not.toHaveCount(0);
```

Replace it with:

```ts
  // Next 16's webpack font-manifest plugin matches loader requests with forward slashes
  // only (next-font-manifest-plugin.js:60), while Windows builds them with path.join
  // (webpack-config.js:1080). The manifest's app map comes out empty and no preload tag is
  // emitted -- on Windows + webpack alone. Production and the Turbopack dev server both
  // emit it, and the daily release runs this suite on ubuntu-latest, so the assertion still
  // guards the real target everywhere it can be true. Every other assertion above stays
  // live on Windows, which is why this is a conditional rather than test.skip().
  if (process.platform !== "win32") {
    await expect(page.locator('link[rel="preload"][as="font"]')).not.toHaveCount(0);
  }
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter crm test:e2e -- tests/acceptance/cle-42-performance.spec.ts
```

Expected on Windows: `1 passed`. Confirm from the run output that the test genuinely executed rather than being skipped — a skipped test reports `1 skipped`, which would mean the guard was written as `test.skip` by mistake.

- [ ] **Step 5: Commit**

```bash
git add apps/crm/tests/acceptance/cle-42-performance.spec.ts
git commit -m "test(crm): scope the font-preload assertion to platforms that can emit it

Next 16's webpack font-manifest plugin collects font modules by testing the
loader request for '/next-font-loader/index.js?', forward slashes only, while
Windows builds that request with path.join. The app map comes out empty,
get-preloadable-fonts returns null, and no <link rel=preload as=font> reaches
the HTML -- on Windows plus webpack alone.

Production ships webpack and emits the tag, the Turbopack dev server emits it,
and the daily release runs this suite on ubuntu-latest, so the assertion keeps
guarding its real target everywhere it can be true. Dropping --webpack from the
Playwright config would have moved the one real font-manifest signal off the
bundler the product is built with.

The guard is a conditional rather than test.skip so the other eight assertions
-- loaded face, weight, font-display optional, successful woff2 response --
stay live on Windows."
```

---

## Task 4: Settle whether `f15-crm-i18n` fails outside isolation

**The finding.** `apps/crm/tests/acceptance/f15-crm-i18n.spec.ts:46` fails at line 95 waiting for the pt-BR heading `"Candidaturas"`, reporting `Test timeout of 60000ms exceeded` and `Protocol error (Runtime.callFunctionOn): Internal server error, session closed`.

**The heading is not the problem.** All four content hypotheses were refuted: `Jobs.applications` is `"Candidaturas"` in pt-BR and `"Applications"` in en-AU at the namespace the component uses; the heading is still an `h2` (`job-detail-workspace.tsx:446`); the `<section>` renders unconditionally; and there is no console error or crash in the retained trace. `cle-86-application-approval.spec.ts:33` asserts the same pt-BR heading and passes. The reported failure is a **teardown artefact**: the test blew its 60 s ceiling, the last navigation resolved after the deadline, and line 95 evaluated milliseconds after the context closed.

**The open question.** The trace's cold routes are exactly the routes no earlier test in *this spec file* visited, which points at an isolated single-spec run against a cold dev server. The repo's real runner (`scripts/run-local-e2e.mjs`, one invocation, `workers: 1`, alphabetical order, f15 last) pre-warms nearly every route through roughly twenty earlier specs. It may well pass there. That has not been measured, and the fix depends on the answer.

**Files:**
- Modify: `apps/crm/tests/acceptance/f15-crm-i18n.spec.ts:50` — only under branch B below

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Run the full CRM suite unmodified**

This is the measurement the whole task turns on. Free ports 3100 and 3101 first.

```bash
pnpm --filter crm test:e2e
```

Note whether `f15-crm-i18n.spec.ts:46` passes, and the reported wall-clock of the whole suite.

- [ ] **Step 2: Take the branch the measurement dictates**

**Branch A — f15 passes in the full suite.** Then it is an isolation artefact, not a defect, and no budget change is warranted. Record the finding in the spec so the next person running it alone does not re-diagnose it. Add this comment immediately above `test.setTimeout(60_000);` at line 50:

```ts
    // This test walks every CRM route in pt-BR. Under the repo runner
    // (scripts/run-local-e2e.mjs, workers: 1, alphabetical) roughly twenty earlier specs
    // have already compiled those routes, and it finishes well inside the budget. Run this
    // file on its own against a cold `next dev` and most routes compile for the first time
    // here, which can exhaust the ceiling and surface as a teardown error on whichever
    // assertion the deadline lands in. Run the whole suite before treating that as a defect.
```

Note that `test.setTimeout(60_000)` on the next line is now redundant with `timeout: 60_000` in `apps/crm/playwright.config.ts` — leave it, since removing it changes nothing and this task is not a tidy-up.

**Branch B — f15 still times out in the full suite.** Then the budget is genuinely too small and the route pre-warming does not save it. Replace line 50:

```ts
    test.setTimeout(60_000);
```

with:

```ts
    // Walking every CRM route in both locales costs more than the 60s config default even
    // with the suite's earlier specs pre-warming most of them.
    test.setTimeout(180_000);
```

- [ ] **Step 3: Verify**

Branch A: re-run `pnpm --filter crm test:e2e` and confirm the suite is still green and f15 still passes — the change is a comment, so this is a no-regression check.

Branch B: run `pnpm --filter crm test:e2e` and confirm f15 passes. Record its individual duration; if it needed more than 120 s, say so in the commit body, because that is a performance signal about the CRM's route compilation rather than a test problem.

- [ ] **Step 4: Commit**

Branch A:

```bash
git add apps/crm/tests/acceptance/f15-crm-i18n.spec.ts
git commit -m "test(crm): record why f15 exhausts its budget only when run alone

Run on its own against a cold next dev, this spec compiles most CRM routes for
the first time itself and can blow the 60s ceiling, surfacing as a teardown
error on whichever assertion the deadline lands in -- most recently the pt-BR
'Candidaturas' heading, which is present, is still an h2, and renders
unconditionally. Under the repo runner roughly twenty earlier specs have
already compiled those routes and it finishes comfortably.

No budget change: the measurement says the suite is green. This is a note so
the next isolated run is not re-diagnosed as a translation defect."
```

Branch B:

```bash
git add apps/crm/tests/acceptance/f15-crm-i18n.spec.ts
git commit -m "test(crm): raise the f15 budget to match what walking every route costs

Walking every CRM route in both locales exceeds the 60s config default even
under the repo runner, where earlier specs have already compiled most routes.
The failure surfaced as a teardown error on the pt-BR 'Candidaturas' heading,
which is present, is still an h2, and renders unconditionally -- the assertion
simply evaluated after the context closed.

Raising the ceiling softens nothing: every expectation still has to come true."
```

---

## Final Verification

- [ ] **Run every gate the daily release runs, in its order**

```bash
pnpm db:reset
pnpm check
pnpm test:e2e
```

Expected: both commands exit 0. `pnpm check` is `test:vocabulary && test:dev-setup && test:auth-templates && test:hosted-auth && test && db:test && test:functions && lint && typecheck && build`.

If `pnpm test:e2e` takes longer than the foreground limit, run the two apps separately: `pnpm --filter cleaner test:e2e` then `pnpm --filter crm test:e2e`.

- [ ] **Confirm no AI attribution reached any commit**

```bash
git log origin/main..HEAD --format="%h %s%n%b" | grep -niE "claude|co-authored|generated with|anthropic|🤖"
```

Expected: no output.

- [ ] **Report the outcome**

State, per task: the RED evidence you observed, the command that turned it green, and the exit code. Name any gate still red and why. If Task 2 Step 1 or Task 4 Step 1 sent you to a "stop and report" branch, that is the outcome — do not improvise a fix past it.

---

## Follow-up

This branch must merge to `main` first; once it has, the CLE-111 branch (`58f9c7b`) can be rebased onto it and merged demonstrating a green gate. The P1 `accept_offer` swallow described in **Out of Scope** remains open and is the only genuine product defect found in this set — it needs a design decision, a failing test, and full delivery discipline, in its own cycle.
