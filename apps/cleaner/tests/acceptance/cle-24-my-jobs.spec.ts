import { expect, test, type Page } from "@playwright/test";

// Runs against the seeded local database (`pnpm db:reset`).
//
// The seed guarantees this shape for Demo Cleaner One, and these tests assert the shape
// rather than counts or dates:
//
//   …0802  Broadbeach Towers    crew 2, both cleaners   → `assigned`, the status chain
//   …0803  Broadbeach Towers    crew 2, one cleaner     → `posted`, the waiting state
//   …0804  Palm Grove Practice  crew 2, both cleaners   → `assigned`, the crew-2 case
//
// The recurring rules also generate part-crewed Broadbeach jobs, so the waiting state
// appears on more cards than …0803 alone. Nothing here counts cards.
//
// Locators never filter a card by the control it currently offers. Advancing a job is
// exactly what changes that control, so such a locator stops matching the card it was
// meant to follow — and a card holding an armed confirmation is invisible to a filter
// looking for "Job done". Cards are addressed by position or by site name instead.
//
// Tests in this file run in order against one database. The chain and finish tests drive
// …0802 to `completed`, so they own it; the crew-2 test owns …0804 on another site.
const cleanerEmail = "cleaner.one@clean-app.example.test";
const crewMateEmail = "cleaner.two@clean-app.example.test";
const unassignedEmail = "cleaner.three@clean-app.example.test";
const demoPassword = "local-demo-only";

// Seeded values that must never reach a cleaner who is not assigned.
const gatedFromUnassigned = ["10 Surf Parade", "Demo access notes"];

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/board$/);
}

function myJobCards(page: Page) {
  return page.getByRole("list", { name: "My jobs" }).getByRole("listitem");
}

/**
 * …0802 is scheduled a day out and every other job of hers is later, so the soonest-first
 * order puts it first for as long as it is live. Each test that uses it asserts the
 * control it expects, so a wrong assumption fails on the spot rather than silently
 * driving the wrong job.
 */
function soonestCard(page: Page) {
  return myJobCards(page).first();
}

function palmGroveCard(page: Page) {
  return myJobCards(page).filter({ hasText: "Palm Grove Practice" }).first();
}

async function openMyJobs(page: Page, email: string) {
  await signIn(page, email);
  await page.goto("/my-jobs");
  await expect(myJobCards(page).first()).toBeVisible();
}

test.describe("@CLE-24 the address is gated on assignment", () => {
  test("stays hidden across the whole cleaner app before she is assigned", async ({ page }) => {
    // Demo Cleaner Three is an active cleaner with no assignment at all, so she is the
    // exact case the gate exists for. Asserted app-wide rather than screen-wide: a future
    // screen that leaks the address must fail this test too.
    await signIn(page, unassignedEmail);

    for (const route of ["/board", "/my-jobs"]) {
      await page.goto(route);
      await expect(page.getByRole("heading").first()).toBeVisible();

      const rendered = await page.locator("body").innerText();
      for (const secret of gatedFromUnassigned) {
        expect(rendered, `${secret} leaked on ${route}`).not.toContain(secret);
      }
    }

    await expect(page.getByText("No jobs yet.")).toBeVisible();
  });

  test("appears on her own card once she asks for it", async ({ page }) => {
    await openMyJobs(page, cleanerEmail);

    const card = soonestCard(page);
    await expect(card.getByRole("button", { name: "On my way" })).toBeVisible();

    // Listing must not reveal it: every get_cleaner_job_access call writes an audit row,
    // so the log would stop meaning "she looked" if merely opening the screen fetched.
    await expect(card).not.toContainText("10 Surf Parade");

    await card.getByRole("button", { name: "Show address" }).click();

    await expect(card).toContainText("10 Surf Parade");
    await expect(card).toContainText("Demo access notes");
    await expect(card.getByRole("link", { name: "Maps" })).toHaveAttribute(
      "href",
      /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=10%20Surf%20Parade/,
    );
  });
});

test.describe("@CLE-24 working the job", () => {
  test("says why a part-crewed job cannot be started", async ({ page }) => {
    await openMyJobs(page, cleanerEmail);

    const waiting = myJobCards(page).filter({ hasText: "Starts once the crew is complete" });
    await expect(waiting.first()).toBeVisible();
    // The reason replaces the control rather than sitting beside a dead button.
    await expect(waiting.first().getByRole("button", { name: "On my way" })).toHaveCount(0);
  });

  test("drives the job through the chain, and the status survives a reload", async ({ page }) => {
    await openMyJobs(page, cleanerEmail);

    const card = soonestCard(page);
    await card.getByRole("button", { name: "On my way" }).click();
    await expect(card.getByRole("button", { name: "Start work" })).toBeVisible();

    // The status lives in the database, not in component state.
    await page.reload();
    await expect(soonestCard(page).getByRole("button", { name: "Start work" })).toBeVisible();

    await soonestCard(page).getByRole("button", { name: "Start work" }).click();
    await expect(soonestCard(page).getByRole("button", { name: "Job done" })).toBeVisible();
  });

  test("takes two taps to finish, and the finished job leaves the list", async ({ page }) => {
    await openMyJobs(page, cleanerEmail);

    const card = soonestCard(page);
    const before = await myJobCards(page).count();
    await expect(card).toContainText("Broadbeach Towers");

    // One tap arms, it does not commit.
    await card.getByRole("button", { name: "Job done" }).click();
    await expect(card).toContainText("This ends the job and cannot be undone.");
    await expect(card.getByRole("button", { name: "Tap again to confirm" })).toBeVisible();

    await card.getByRole("button", { name: "Tap again to confirm" }).click();

    // cleaner_my_jobs filters `completed`, so the job simply stops coming back — the list
    // is one shorter and the card that was first has been replaced by the next one.
    await expect(myJobCards(page)).toHaveCount(before - 1);
    await expect(myJobCards(page).filter({ hasText: "Job done" })).toHaveCount(0);
  });
});

test.describe("@CLE-24 a crew of two shares one job", () => {
  test("the second assigned cleaner sees the same card and may move it on", async ({ page }) => {
    // Status is job-level: either cleaner on the crew may advance it, and the other sees
    // the result. Per-slot completion is deliberately out of scope for this milestone.
    await openMyJobs(page, cleanerEmail);

    await palmGroveCard(page).getByRole("button", { name: "On my way" }).click();
    await expect(palmGroveCard(page).getByRole("button", { name: "Start work" })).toBeVisible();

    // Sign out lives on the board; the profile tab that would carry it is CLE-26.
    await page.goto("/board");
    await page.getByRole("button", { name: "Sign out" }).click();
    await openMyJobs(page, crewMateEmail);

    // She sees her crew mate's change, and the control is hers to use as well.
    const sameJob = palmGroveCard(page);
    await expect(sameJob.getByRole("button", { name: "Start work" })).toBeEnabled();
    await sameJob.getByRole("button", { name: "Start work" }).click();
    await expect(palmGroveCard(page).getByRole("button", { name: "Job done" })).toBeVisible();
  });
});
