import { expect, test } from "@playwright/test";

const adminEmail = "admin@clean-app.example.test";
const cleanerEmail = "cleaner.one@clean-app.example.test";
const demoPassword = "local-demo-only";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("@CLE-43 company Money list", () => {
  test("shows seeded crew-slot pay history and exact totals without settlement actions", async ({
    page,
  }) => {
    await signIn(page, adminEmail);
    await expect(page).toHaveURL(/\/en-AU\/roster$/);
    await page.goto("/en-AU/money");

    await expect(page).toHaveTitle("Money · The Clean Crew");
    await expect(page.getByRole("heading", { name: "Money", exact: true })).toBeVisible();
    const totals = page.getByRole("region", { name: "Money totals" });
    await expect(totals.getByText("Total owed")).toBeVisible();
    await expect(totals.getByText("Total paid")).toBeVisible();
    await expect(totals.getByText("$120.00")).toHaveCount(2);

    const table = page.getByRole("table", { name: "Company pay ledger" });
    const seededRows = table
      .getByRole("row")
      .filter({ hasText: "Broadbeach Towers" });
    await expect(seededRows).toHaveCount(2);
    await expect(seededRows.filter({ hasText: "Demo Cleaner One" })).toContainText("Paid");
    await expect(seededRows.filter({ hasText: "Demo Cleaner Two" })).toContainText("Owed");
    await expect(seededRows.getByText("$120.00")).toHaveCount(2);
    const moneyPage = page.getByRole("main");
    await expect(moneyPage.getByRole("button")).toHaveCount(0);
    await expect(moneyPage.getByText(/mark paid/i)).toHaveCount(0);
  });

  test("refuses a cleaner account and never exposes the Money table", async ({ page }) => {
    await signIn(page, cleanerEmail);
    await expect(page.locator(".form-error")).toContainText("for company admins");

    await page.goto("/en-AU/money");
    await expect(page).toHaveURL(/\/en-AU\/login\?error=not-authorised$/);
    await expect(page.getByRole("table", { name: "Company pay ledger" })).toHaveCount(0);
  });
});
