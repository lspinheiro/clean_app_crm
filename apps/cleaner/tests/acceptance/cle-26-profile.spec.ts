import { expect, test, type Page } from "@playwright/test";

const cleanerEmail = "cleaner.one@clean-app.example.test";
const demoPassword = "local-demo-only";
const secondCompanyCode = "HARBR2DEMOJOIN99";

async function signIn(page: Page) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(cleanerEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en-AU\/board$/);
}

test.describe("@CLE-26 cleaner profile and company membership", () => {
  test("persists profile edits, joins a second company, merges its vacancies, and signs out", async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/en-AU\/profile$/);

    await expect(page.getByRole("heading", { name: "Your profile", level: 1 })).toBeVisible();
    await expect(page.getByText("Coastal Demo Cleaning")).toBeVisible();
    await expect(page.getByText(/availab/i)).toHaveCount(0);

    await page.getByLabel("Full name").fill("Ana Profile");
    await page.getByLabel("Phone").fill("0400 111 222");
    await page.getByLabel("Suburb").fill("Southport");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toContainText("Profile saved");

    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Ana Profile");
    await expect(page.getByLabel("Phone")).toHaveValue("0400 111 222");
    await expect(page.getByLabel("Suburb")).toHaveValue("Southport");

    await page.getByLabel("Cleaner invitation code").fill(secondCompanyCode);
    await page.getByRole("button", { name: "Join company" }).click();
    await expect(page.getByRole("status")).toContainText("Harbour Demo Cleaning");
    await expect(page.getByText("Harbour Demo Cleaning", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Open jobs" }).click();
    const cards = page.getByRole("list", { name: "Open jobs" }).getByRole("listitem");
    await expect(cards.filter({ hasText: "Coastal Demo Cleaning" }).first()).toBeVisible();
    await expect(cards.filter({ hasText: "Harbour Demo Cleaning" }).first()).toBeVisible();

    await page.getByRole("link", { name: "Profile" }).click();
    await page.getByRole("button", { name: "Sign out" }).last().click();
    await expect(page).toHaveURL(/\/en-AU\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  });
});
