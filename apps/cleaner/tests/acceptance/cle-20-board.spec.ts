import { expect, test, type Page } from "@playwright/test";

// Runs against the seeded local database (`pnpm db:reset`).
//
// The seed's recurring rules generate instances across a rolling 28-day horizon, so how
// many vacancies exist — and on which dates — moves with the calendar. These tests assert
// the *shape* the seed guarantees, never a count or a date:
//
//   Broadbeach Towers   crew of 2, one named cleaner  → slot 1 always taken, slot 2 offered
//   Palm Grove Practice crew of 1, no named cleaner   → fully open, no crew line
//   Southport Office    crew of 1, one named cleaner  → fully assigned, never on the board
//
// removed.cleaner has a historical cleaner membership but belongs to no active company, so her
// board is the empty state.
const cleanerEmail = "cleaner.two@clean-app.example.test";
const removedMembershipEmail = "removed.cleaner@clean-app.example.test";
const demoPassword = "local-demo-only";

// Seeded values the board must never surface.
const hiddenFromCleaners = [
  "10 Surf Parade",
  "45 Nerang Street",
  "Demo access notes",
  "07 5555 0101",
];

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/board$/);
}

function boardCards(page: Page) {
  return page.getByRole("list", { name: "Open jobs" }).getByRole("listitem");
}

test.describe("@CLE-20 the board of open vacancies", () => {
  test("lists open vacancies from the companies she belongs to", async ({ page }) => {
    await signIn(page, cleanerEmail);

    const cards = boardCards(page);
    await expect(cards.first()).toBeVisible();

    // Both sites with open work reach the board.
    await expect(cards.filter({ hasText: "Broadbeach Towers" }).first()).toBeVisible();
    await expect(cards.filter({ hasText: "Palm Grove Practice" }).first()).toBeVisible();

    // Every card carries the six facts the ticket asks for.
    const soonest = cards.first();
    await expect(soonest).toContainText("Coastal Demo Cleaning");
    await expect(soonest).toContainText(/(Broadbeach Towers · Broadbeach|Palm Grove Practice · Robina)/);
    await expect(soonest).toContainText(/Standard clean · \d+ h/);
    await expect(soonest).toContainText(/\d{1,2}:\d{2} (am|pm)/);
    await expect(soonest).toContainText(/\$\d+/);
  });

  test("offers only the slots still open on a part-filled crew job", async ({ page }) => {
    await signIn(page, cleanerEmail);

    const cards = boardCards(page);
    await expect(cards.first()).toBeVisible();

    // Broadbeach runs a crew of two with one named cleaner, so slot 1 is always taken and
    // each of its jobs is one card offering one slot — never two identical cards.
    const crewCards = cards.filter({ hasText: "Broadbeach Towers" });
    const crewCount = await crewCards.count();
    expect(crewCount).toBeGreaterThan(0);
    for (let index = 0; index < crewCount; index += 1) {
      await expect(crewCards.nth(index)).toContainText("1 of 2 spots open");
    }

    // A single-cleaner job says nothing about crew.
    await expect(cards.filter({ hasText: "Palm Grove Practice" }).first()).not.toContainText(
      "spots open",
    );

    // Southport Office is crew-of-one with a named cleaner: no slot is ever open there.
    await expect(cards.filter({ hasText: "Southport Office" })).toHaveCount(0);
  });

  test("never shows an address, access notes, or client contact", async ({ page }) => {
    await signIn(page, cleanerEmail);
    await expect(boardCards(page).first()).toBeVisible();

    const rendered = await page.locator("body").innerText();
    for (const secret of hiddenFromCleaners) {
      expect(rendered).not.toContain(secret);
    }
    // The suburb is the one location detail she may see before assignment.
    expect(rendered).toContain("Broadbeach");
  });

  test("survives a reload, because the board is read from the database", async ({ page }) => {
    await signIn(page, cleanerEmail);
    await expect(boardCards(page).first()).toBeVisible();
    const before = await boardCards(page).count();

    await page.reload();

    await expect(boardCards(page).first()).toBeVisible();
    expect(await boardCards(page).count()).toBe(before);
  });

  test("explains an empty board instead of showing a blank screen", async ({ page }) => {
    await signIn(page, removedMembershipEmail);

    await expect(page.getByText("No open jobs yet.")).toBeVisible();
    await expect(
      page.getByText("When a company you work with posts a job, it appears here."),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Open jobs" })).toHaveCount(0);
  });
});
