import { expect, test } from "@playwright/test";

const demoPassword = "local-demo-only";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function openAccountMenu(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
}

async function openCompanySwitcher(
  page: import("@playwright/test").Page,
  companyName: string,
) {
  await page.getByRole("button", { name: `Current company: ${companyName}` }).click();
}

test.describe("@CLE-82 one active CRM company", () => {
  test("a multi-membership account switches the whole CRM and restores the choice", async ({
    page,
  }) => {
    await signIn(page, "owner.harbour@clean-app.example.test");

    await expect(page).toHaveURL(/\/en-AU\/roster$/);
    await openCompanySwitcher(page, "Harbour Demo Cleaning");
    await expect(
      page.getByRole("group", { name: "Your companies" })
        .getByText("Harbour Demo Cleaning", { exact: true }),
    ).toBeVisible();
    await openCompanySwitcher(page, "Harbour Demo Cleaning");
    await page.getByRole("link", { name: "Clients" }).click();
    await expect(page.getByText("Oceanview Property Group", { exact: true })).toHaveCount(0);
    await openCompanySwitcher(page, "Harbour Demo Cleaning");
    await page.getByRole("button", { name: "Switch to Coastal Demo Cleaning" }).click();

    await expect(page).toHaveURL(/\/en-AU\/roster$/);
    await openCompanySwitcher(page, "Coastal Demo Cleaning");
    await expect(
      page.getByRole("group", { name: "Your companies" })
        .getByText("Coastal Demo Cleaning", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Clients" }).click();
    await expect(page.getByText("Oceanview Property Group", { exact: true })).toBeVisible();

    await openAccountMenu(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, "owner.harbour@clean-app.example.test");
    await openCompanySwitcher(page, "Coastal Demo Cleaning");
    await expect(
      page.getByRole("group", { name: "Your companies" })
        .getByText("Coastal Demo Cleaning", { exact: true }),
    ).toBeVisible();
  });

  test("a single-membership account sees company context and creation", async ({ page }) => {
    await signIn(page, "admin@clean-app.example.test");

    await expect(page.getByRole("link", { name: "The Clean Crew home" })).toBeVisible();
    await openCompanySwitcher(page, "Coastal Demo Cleaning");
    await expect(page.getByRole("link", { name: "Create new company" })).toBeVisible();
    await expect(page.getByText("Owner", { exact: true })).toBeVisible();

    await page.keyboard.press("Escape");
    await openAccountMenu(page);
    await expect(page.getByRole("group", { name: "Switch company" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Create new company" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

    await page.getByRole("heading", { name: "Roster", level: 1 }).click();

    await expect(page.getByRole("button", { name: "Sign out" })).not.toBeVisible();
  });

  test("an account without employee membership gets guidance and the cleaner app", async ({
    page,
  }) => {
    await signIn(page, "cleaner.one@clean-app.example.test");

    await expect(page).toHaveURL(/\/en-AU\/no-company-access$/);
    await expect(page.getByRole("heading", { name: "No company access" })).toBeVisible();
    await expect(page.getByText(/ask an owner for an invitation/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the cleaner app" })).toHaveAttribute(
      "href",
      "http://127.0.0.1:3001/",
    );
    await expect(page.locator(".form-error")).toHaveCount(0);
  });
});
