import { expect, test } from "@playwright/test";

const adminEmail = "admin@clean-app.example.test";
const demoPassword = "local-demo-only";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en-AU\/roster$/);
}

test("@CLE-9 adds, reorders, and removes eligible preferred cleaners", async ({ page }) => {
  await signIn(page);
  await page.goto("/en-AU/clients/10000000-0000-4000-8000-000000000301");

  const siteCard = page.getByRole("group", { name: "Broadbeach Towers" });
  const cleanerSelect = siteCard.getByRole("combobox", { name: "Preferred cleaner" });
  const addButton = siteCard.getByRole("button", {
    name: "Add preferred cleaner to Broadbeach Towers",
  });
  const existingRemoveButtons = siteCard.getByRole("button", { name: /^Remove / });

  while ((await existingRemoveButtons.count()) > 0) {
    const previousCount = await existingRemoveButtons.count();
    await existingRemoveButtons.first().click();
    await expect(existingRemoveButtons).toHaveCount(previousCount - 1);
  }

  for (const cleaner of ["Demo Cleaner One", "Demo Cleaner Two", "Demo Cleaner Three"]) {
    await cleanerSelect.selectOption({ label: cleaner });
    await addButton.click();
    await expect(
      siteCard.getByRole("list", { name: "Preferred cleaners for Broadbeach Towers" }),
    ).toContainText(cleaner);
  }

  const preferredList = siteCard.getByRole("list", {
    name: "Preferred cleaners for Broadbeach Towers",
  });
  await expect(preferredList.getByRole("listitem")).toHaveCount(3);
  await expect(preferredList.getByRole("listitem").nth(0)).toContainText("1");
  await expect(preferredList.getByRole("listitem").nth(0)).toContainText("Demo Cleaner One");

  await siteCard.getByRole("button", { name: "Move Demo Cleaner Three up" }).click();
  await siteCard.getByRole("button", { name: "Move Demo Cleaner Three up" }).click();
  await page.reload();

  const reorderedList = page
    .getByRole("group", { name: "Broadbeach Towers" })
    .getByRole("list", { name: "Preferred cleaners for Broadbeach Towers" });
  await expect(reorderedList.getByRole("listitem").nth(0)).toContainText("Demo Cleaner Three");

  await page
    .getByRole("group", { name: "Broadbeach Towers" })
    .getByRole("button", { name: "Remove Demo Cleaner One" })
    .click();
  await expect(reorderedList.getByRole("listitem")).toHaveCount(2);
  await expect(reorderedList.getByRole("listitem").nth(0)).toContainText("1");
  await expect(reorderedList.getByRole("listitem").nth(1)).toContainText("2");
  await expect(reorderedList).not.toContainText("Demo Cleaner One");
  await expect(
    page
      .getByRole("group", { name: "Broadbeach Towers" })
      .locator(".preference-status"),
  ).toHaveText("Preferred cleaner order saved.");
  await expect(
    page
      .getByRole("group", { name: "Broadbeach Towers" })
      .getByRole("combobox", { name: "Preferred cleaner" }),
  ).toBeFocused();
});
