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
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en-AU\/roster$/);
}

test("@CLE-33 mobile grid shows a usable day window with snap and sticky headers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 480 });
  await signIn(page);
  await page.goto(`/en-AU/roster?week=${weekStart}&view=site`);

  for (const label of ["Jobs", "Cleaners"]) {
    const target = page.getByRole("link", { name: label, exact: true });
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  const grid = page.getByRole("region", { name: "Roster by site" });
  await expect(grid).toBeVisible();

  // At least two full day columns fit beside the label column at 390px.
  const labelHeader = grid.getByRole("columnheader", { name: "Site" });
  const mondayHeader = grid.getByRole("columnheader", { name: /^Mon / });
  const tuesdayHeader = grid.getByRole("columnheader", { name: /^Tue / });
  await expect(mondayHeader).toBeInViewport({
    ratio: 1,
  });
  await expect(tuesdayHeader).toBeInViewport({
    ratio: 1,
  });
  const [gridBox, labelBox, mondayBox, tuesdayBox] = await Promise.all([
    grid.boundingBox(),
    labelHeader.boundingBox(),
    mondayHeader.boundingBox(),
    tuesdayHeader.boundingBox(),
  ]);
  expect(labelBox?.x).toBeGreaterThanOrEqual(gridBox?.x ?? 0);
  expect(mondayBox?.x).toBeGreaterThanOrEqual(labelBox?.x ?? 0);
  expect(mondayBox?.x).toBeGreaterThanOrEqual(
    (labelBox?.x ?? 0) + (labelBox?.width ?? 0) - 1,
  );
  expect((tuesdayBox?.x ?? 0) + (tuesdayBox?.width ?? 0))
    .toBeLessThanOrEqual((gridBox?.x ?? 0) + (gridBox?.width ?? 0) + 1);

  // Horizontal panning snaps to day-column boundaries.
  const snapType = await grid.evaluate(
    (element) => getComputedStyle(element).scrollSnapType,
  );
  expect(snapType).toContain("x");
  const dayWidth = (tuesdayBox?.x ?? 0) - (mondayBox?.x ?? 0);
  expect(dayWidth).toBeGreaterThan(0);
  await grid.evaluate((element, target) => {
    element.scrollTo({ left: target, behavior: "smooth" });
  }, dayWidth * 1.8);
  await expect.poll(async () => {
    const scrollLeft = await grid.evaluate((element) => element.scrollLeft);
    return Math.abs(scrollLeft / dayWidth - Math.round(scrollLeft / dayWidth)) < 0.05;
  }).toBe(true);

  // The day header row is sticky inside the grid's vertical scroll container,
  // so the Mon–Sun mapping survives scanning tall pivots.
  const headerPosition = await mondayHeader.evaluate(
    (element) => getComputedStyle(element).position,
  );
  expect(headerPosition).toBe("sticky");
  const headerTopBefore = (await mondayHeader.boundingBox())?.y ?? 0;
  const scrollTop = await grid.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
  const headerTopAfter = (await mondayHeader.boundingBox())?.y ?? 0;
  expect(Math.abs(headerTopAfter - headerTopBefore)).toBeLessThanOrEqual(1);

  // Gap context stays visually recoverable in the narrow cleaner pivot rather
  // than being clipped behind an ellipsis.
  await page.goto(`/en-AU/roster?week=${weekStart}&view=cleaner`);
  const gapDetails = page.getByTestId("roster-gap").first().locator("span, small");
  await expect(gapDetails.first()).toBeVisible();
  const detailLayout = await gapDetails.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return {
      fitsInline: element.scrollWidth <= element.clientWidth,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    };
  }));
  expect(detailLayout).not.toHaveLength(0);
  expect(detailLayout.every((detail) => detail.fitsInline)).toBe(true);
  expect(detailLayout.every((detail) => detail.textOverflow === "clip")).toBe(true);
  expect(detailLayout.every((detail) => detail.whiteSpace === "normal")).toBe(true);
});
