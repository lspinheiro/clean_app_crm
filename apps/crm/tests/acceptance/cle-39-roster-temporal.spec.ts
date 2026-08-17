import { expect, test } from "@playwright/test";

import {
  addDays,
  formatRosterTitle,
  getBrisbaneDateKey,
  normaliseWeekStart,
} from "../../src/features/roster/calendar";

const adminEmail = "admin@clean-app.example.test";
const demoPassword = "local-demo-only";
const currentWeekStart = normaliseWeekStart(getBrisbaneDateKey());
if (!currentWeekStart) throw new Error("Could not derive the current Brisbane week.");
const otherWeekStart = addDays(currentWeekStart, 7);

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en-AU\/roster$/);
}

test("@CLE-39 keeps the displayed week and pivot anchored in title and controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto(`/en-AU/roster?week=${otherWeekStart}&view=site`);

  await expect(page).toHaveTitle(`${formatRosterTitle(otherWeekStart, "site")} · The Clean Crew`);
  const thisWeek = page.getByRole("link", { name: "This week" });
  await expect(thisWeek).toBeVisible();
  const target = await thisWeek.boundingBox();
  expect(target?.height).toBeGreaterThanOrEqual(44);

  await thisWeek.click();
  await expect(page).toHaveURL(`/en-AU/roster?week=${currentWeekStart}&view=site`);
  await expect(page.locator('th[aria-current="date"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "This week" })).toHaveCount(0);
});
