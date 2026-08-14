import { expect, test, type Page } from "@playwright/test";

// Runs against the seeded local database (`pnpm db:reset`). cleaner.two sees seven open
// vacancies: four at a crew-of-two site with one slot already assigned, three single-cleaner
// jobs. removed.cleaner is in no active pool, so her board is the empty state.
const cleanerEmail = "cleaner.two@clean-app.example.test";
const poollessEmail = "removed.cleaner@clean-app.example.test";
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

test.describe("@CLE-20 the board of open vacancies", () => {
  test("lists every open vacancy from the pools she belongs to", async ({ page }) => {
    await signIn(page, cleanerEmail);

    const board = page.getByRole("list", { name: "Open jobs" });
    await expect(board.getByRole("listitem")).toHaveCount(7);

    const soonest = board.getByRole("listitem").first();
    await expect(soonest).toContainText("Coastal Demo Cleaning");
    await expect(soonest).toContainText("Broadbeach Towers · Broadbeach");
    await expect(soonest).toContainText("Standard clean · 2 h");
    await expect(soonest).toContainText("$120");
    await expect(soonest).toContainText("8:00 am");
  });

  test("shows a part-filled crew job once, counting only the slots still open", async ({
    page,
  }) => {
    await signIn(page, cleanerEmail);

    const board = page.getByRole("list", { name: "Open jobs" });
    // The crew-of-two site has one slot assigned, so each of its jobs is one card, not two.
    await expect(board.getByText("1 of 2 spots open")).toHaveCount(4);
    // Single-cleaner jobs say nothing about crew.
    await expect(board.getByText("1 of 1 spots open")).toHaveCount(0);
  });

  test("never shows an address, access notes, or client contact", async ({ page }) => {
    await signIn(page, cleanerEmail);
    await page.getByRole("list", { name: "Open jobs" }).waitFor();

    const rendered = await page.locator("body").innerText();
    for (const secret of hiddenFromCleaners) {
      expect(rendered).not.toContain(secret);
    }
    // The suburb is the one location detail she may see before assignment.
    expect(rendered).toContain("Broadbeach");
  });

  test("survives a reload, because the board is read from the database", async ({ page }) => {
    await signIn(page, cleanerEmail);
    await expect(page.getByRole("list", { name: "Open jobs" }).getByRole("listitem")).toHaveCount(7);

    await page.reload();

    await expect(page.getByRole("list", { name: "Open jobs" }).getByRole("listitem")).toHaveCount(7);
  });

  test("explains an empty board instead of showing a blank screen", async ({ page }) => {
    await signIn(page, poollessEmail);

    await expect(page.getByText("No open jobs yet.")).toBeVisible();
    await expect(
      page.getByText("When a company you work with posts a job, it appears here."),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Open jobs" })).toHaveCount(0);
  });
});
