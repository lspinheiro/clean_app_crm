import { expect, test } from "@playwright/test";

const demoPassword = "local-demo-only";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("additional company creation", () => {
  test("an existing employee creates a company, becomes its owner, and can switch back", async ({
    page,
  }) => {
    await signIn(page, "admin@clean-app.example.test");

    await page.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    }).click();
    await page.getByRole("link", { name: "Create new company" }).click();

    await expect(page).toHaveURL(/\/en-AU\/companies\/new$/);
    await expect(page.getByRole("link", { name: "Back to Coastal Demo Cleaning" }))
      .toBeVisible();
    await page.getByRole("textbox", { name: "Company name" }).fill("Northern Shores Cleaning");
    await page.getByRole("textbox", { name: "ABN" }).fill("49 999 999 999");
    await page.getByRole("button", { name: "Create company" }).click();

    await expect(page).toHaveURL(/\/en-AU\/roster$/);
    await expect(page.getByRole("button", {
      name: "Current company: Northern Shores Cleaning",
    })).toBeVisible();

    await page.getByRole("button", {
      name: "Current company: Northern Shores Cleaning",
    }).click();
    await expect(
      page.getByRole("group", { name: "Your companies" })
        .locator('[aria-current="true"]'),
    ).toContainText("Owner");
    await page.getByRole("button", { name: "Switch to Coastal Demo Cleaning" }).click();
    await expect(page.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    })).toBeVisible();
  });

  test("duplicate ABN guidance preserves the prior company and entered name", async ({ page }) => {
    await signIn(page, "admin@clean-app.example.test");
    await page.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    }).click();
    await page.getByRole("link", { name: "Create new company" }).click();

    await page.getByRole("textbox", { name: "Company name" }).fill("Duplicate Coastal");
    await page.getByRole("textbox", { name: "ABN" }).fill("51824753556");
    await page.getByRole("button", { name: "Create company" }).click();

    await expect(page.getByText(/already belongs to a company/i)).toBeVisible();
    await expect(page.getByText(/ask an owner for an invitation/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "ABN" })).toBeFocused();
    await expect(page.getByRole("textbox", { name: "Company name" }))
      .toHaveValue("Duplicate Coastal");
    await expect(page).toHaveURL(/\/en-AU\/companies\/new$/);
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    })).toBeVisible();
  });

  test("invalid input and cancellation create no company", async ({ page }) => {
    await signIn(page, "admin@clean-app.example.test");
    await page.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    }).click();
    await page.getByRole("link", { name: "Create new company" }).click();

    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page.getByText("Enter a company name.")).toBeVisible();
    await expect(page.getByText("Enter exactly 11 digits.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Company name" })).toBeFocused();
    await page.getByRole("link", { name: "Cancel" }).click();

    await page.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    }).click();
    await expect(page.getByText("Northern Shores Cleaning", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Duplicate Coastal", { exact: true })).toHaveCount(0);
  });
});
