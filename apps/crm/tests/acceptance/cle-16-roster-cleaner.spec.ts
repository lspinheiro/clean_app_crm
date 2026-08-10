import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import {
  addDays,
  getBrisbaneDateKey,
  getRosterWeekBounds,
  normaliseWeekStart,
} from "../../src/features/roster/calendar";

const adminEmail = "admin@clean-app.example.test";
const demoPassword = "local-demo-only";
const currentWeekStart = normaliseWeekStart(getBrisbaneDateKey());
if (!currentWeekStart) throw new Error("Could not derive the current Brisbane week.");
const weekStart = addDays(currentWeekStart, 7);
const nextWeekStart = addDays(weekStart, 7);
const { startsAt: weekStartUtc, endsAt: weekEndUtc } = getRosterWeekBounds(weekStart);

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/roster$/);
}

async function visibleVacancyCount() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Local Supabase environment is unavailable.");

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: demoPassword,
  });
  if (signInError) throw signInError;

  const { count, error } = await supabase
    .from("vacancies")
    .select("job_id,crew_slot", { count: "exact", head: true })
    .eq("company_id", "10000000-0000-4000-8000-000000000010")
    .gte("scheduled_start", weekStartUtc)
    .lt("scheduled_start", weekEndUtc);
  if (error) throw error;
  return count ?? 0;
}

test("@CLE-16 renders the generated week by cleaner with exact vacancy evidence", async ({
  page,
}) => {
  const expectedVacancies = await visibleVacancyCount();
  expect(expectedVacancies).toBeGreaterThan(0);

  await signIn(page);
  await page.goto(`/roster?week=${weekStart}`);

  await expect(page.getByRole("heading", { name: "Roster", level: 1 })).toBeVisible();
  const grid = page.getByRole("region", { name: "Roster by cleaner" });
  await expect(grid).toBeVisible();
  const accessibilityTree = await grid.ariaSnapshot();
  expect(accessibilityTree).not.toContain("—");
  expect(accessibilityTree).toContain("No work");
  await expect(grid.getByTestId("roster-gap")).toHaveCount(expectedVacancies);
  await expect(page.getByTestId("roster-gap-count")).toHaveText(
    `${expectedVacancies} unfilled slots`,
  );
  await expect(page.getByTestId("roster-footer-gap-count")).toHaveText(
    `${expectedVacancies} unfilled slots this week`,
  );

  await expect(grid).toContainText("Demo Cleaner One");
  await expect(grid).toContainText("Broadbeach Towers");
  await expect(grid).toContainText("8:00");
  await expect(grid).toContainText("2 cleaners");

  const nextWeek = page.getByRole("link", { name: "Next week" });
  await expect(nextWeek).toHaveAttribute("href", new RegExp(`week=${nextWeekStart}`));
  await nextWeek.click();
  await expect(page).toHaveURL(new RegExp(`week=${nextWeekStart}`));

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileGrid = page.getByRole("region", { name: "Roster by cleaner" });
  await expect(mobileGrid).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await expect
    .poll(() => mobileGrid.evaluate((element) => element.scrollWidth > element.clientWidth))
    .toBe(true);
  const scrollLeft = await mobileGrid.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  expect(scrollLeft).toBeGreaterThan(0);
  await expect(mobileGrid.getByRole("columnheader", { name: /^Sun / })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Offer to pool" })).toBeDisabled();
  await expect(page.getByText("Available after the cleaner job board launches.")).toBeVisible();
});
