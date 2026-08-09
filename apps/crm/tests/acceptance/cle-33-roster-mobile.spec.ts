import { expect, test } from "@playwright/test";

import {
  addDays,
  getBrisbaneDateKey,
  normaliseWeekStart,
} from "../../src/features/roster/calendar";

const adminEmail = "admin@clean-app.example.test";
const demoPassword = "local-demo-only";
const currentWeekStart = normaliseWeekStart(getBrisbaneDateKey());
if (!currentWeekStart) throw new Error("Could not derive the current Brisbane week.");
const weekStart = addDays(currentWeekStart, 7);

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/roster$/);
}

test("@CLE-33 mobile grid shows a usable day window with snap and sticky headers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto(`/roster?week=${weekStart}`);

  const grid = page.getByRole("region", { name: "Roster by cleaner" });
  await expect(grid).toBeVisible();

  // At least two full day columns fit beside the label column at 390px.
  await expect(grid.getByRole("columnheader", { name: /^Mon / })).toBeInViewport({
    ratio: 1,
  });
  await expect(grid.getByRole("columnheader", { name: /^Tue / })).toBeInViewport({
    ratio: 1,
  });

  // Horizontal panning snaps to day-column boundaries.
  const snapType = await grid.evaluate(
    (element) => getComputedStyle(element).scrollSnapType,
  );
  expect(snapType).toContain("x");

  // The day header row is sticky inside the grid's vertical scroll container,
  // so the Mon–Sun mapping survives scanning tall pivots.
  const headerPosition = await grid
    .getByRole("columnheader", { name: /^Mon / })
    .evaluate((element) => getComputedStyle(element).position);
  expect(headerPosition).toBe("sticky");
  const scrollsVertically = await grid.evaluate(
    (element) => getComputedStyle(element).overflowY !== "visible"
      && element.scrollHeight >= element.clientHeight,
  );
  expect(scrollsVertically).toBe(true);
});
