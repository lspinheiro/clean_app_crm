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

test("@CLE-14 creates, edits, toggles, and reloads a crew schedule", async ({ page }) => {
  await signIn(page);
  await page.goto("/en-AU/clients/10000000-0000-4000-8000-000000000301");

  const site = page.getByRole("group", { name: "Broadbeach Towers" });
  const recurring = site.getByRole("region", {
    name: "Recurring assignments for Broadbeach Towers",
  });
  await recurring.getByRole("button", { name: "Add schedule" }).click();

  const createDialog = page.getByRole("dialog", {
    name: "Add schedule for Broadbeach Towers",
  });
  await createDialog.getByLabel("Service", { exact: true }).selectOption({ label: "Office clean" });
  await createDialog.getByLabel("Frequency").selectOption("fortnightly");
  await createDialog.getByLabel("First service date").fill("2026-08-15");
  await createDialog.getByLabel("Start time").fill("23:45");
  await createDialog.getByLabel("Estimated hours").fill("2.5");
  await createDialog.getByLabel("Cleaner pay per slot (AUD)").fill("120.50");
  await createDialog.getByLabel("Crew size").fill("2");
  await createDialog.getByLabel("Slot 1").selectOption({ label: "Demo Cleaner Three" });
  await createDialog.getByRole("button", { name: "Add schedule" }).click();

  const createdRow = recurring
    .getByRole("listitem")
    .filter({ hasText: "Every second Sat" })
    .last();
  await expect(createdRow).toContainText("Demo Cleaner Three + 1 open");
  await expect(createdRow).toContainText("$120.50/slot");
  await createdRow.getByRole("button", { name: "Edit Every second Sat" }).click();

  const editDialog = page.getByRole("dialog", { name: "Edit Every second Sat" });
  await editDialog.getByLabel("Frequency").selectOption("weekly");
  await editDialog.getByLabel("First service date").fill("2026-08-16");
  await editDialog.getByLabel("Start time").fill("22:15");
  await editDialog.getByRole("button", { name: "Save changes" }).click();

  const editedRow = recurring.getByRole("listitem").filter({ hasText: "Every Sun" }).last();
  await expect(editedRow).toContainText("22:15");
  await editedRow.getByRole("switch", { name: "Deactivate Every Sun" }).click();
  await expect(recurring.getByRole("status")).toContainText("status saved");

  await page.reload();
  const reloadedSite = page.getByRole("group", { name: "Broadbeach Towers" });
  const reloadedRecurring = reloadedSite.getByRole("region", {
    name: "Recurring assignments for Broadbeach Towers",
  });
  const reloadedRow = reloadedRecurring
    .getByRole("listitem")
    .filter({ hasText: "Every Sun" })
    .last();
  await expect(reloadedRow.getByRole("switch", { name: "Activate Every Sun" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(reloadedRecurring.getByRole("button", { name: "Add schedule" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
