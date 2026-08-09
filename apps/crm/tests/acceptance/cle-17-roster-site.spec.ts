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
const companyId = "10000000-0000-4000-8000-000000000010";
const visibleJobStatuses = ["posted", "assigned", "on_the_way", "in_progress", "completed"];
const currentWeekStart = normaliseWeekStart(getBrisbaneDateKey());
if (!currentWeekStart) throw new Error("Could not derive the current Brisbane week.");
const weekStart = addDays(currentWeekStart, 7);
const { startsAt, endsAt } = getRosterWeekBounds(weekStart);

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/roster$/);
}

async function expectedRosterEvidence() {
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

  const [vacanciesResult, clientsResult] = await Promise.all([
    supabase
      .from("vacancies")
      .select("job_id,crew_slot", { count: "exact" })
      .eq("company_id", companyId)
      .gte("scheduled_start", startsAt)
      .lt("scheduled_start", endsAt)
      .order("job_id")
      .order("crew_slot"),
    supabase
      .from("clients")
      .select("id")
      .eq("company_id", companyId),
  ]);
  if (vacanciesResult.error) throw vacanciesResult.error;
  if (clientsResult.error) throw clientsResult.error;
  if (vacanciesResult.count !== vacanciesResult.data.length) {
    throw new Error("Vacancy evidence was truncated.");
  }

  const clientIds = clientsResult.data.map((client) => client.id);
  if (clientIds.length === 0) throw new Error("Demo company clients are unavailable.");
  const sitesResult = await supabase
    .from("sites")
    .select("id")
    .in("client_id", clientIds);
  if (sitesResult.error) throw sitesResult.error;
  const siteIds = sitesResult.data.map((site) => site.id);
  if (siteIds.length === 0) throw new Error("Demo company sites are unavailable.");
  const jobsResult = await supabase
    .from("jobs")
    .select("id", { count: "exact" })
    .in("site_id", siteIds)
    .gte("scheduled_start", startsAt)
    .lt("scheduled_start", endsAt)
    .in("status", visibleJobStatuses)
    .order("id");
  if (jobsResult.error) throw jobsResult.error;
  if (jobsResult.count !== jobsResult.data.length) {
    throw new Error("Job evidence was truncated.");
  }

  return {
    vacancyKeys: vacanciesResult.data
      .map((row) => `${row.job_id}:${row.crew_slot}`)
      .sort(),
    jobIds: jobsResult.data.map((job) => job.id).sort(),
  };
}

async function attributeSet(
  locator: import("@playwright/test").Locator,
  attribute: string,
) {
  return [...new Set(await locator.evaluateAll((elements, name) => (
    elements
      .map((element) => element.getAttribute(name))
      .filter((value): value is string => value !== null)
  ), attribute))].sort();
}

test("@CLE-17 pivots the same roster week by site without changing vacancy evidence", async ({
  page,
}) => {
  const { jobIds, vacancyKeys } = await expectedRosterEvidence();
  expect(vacancyKeys.length).toBeGreaterThan(0);
  expect(jobIds.length).toBeGreaterThan(0);

  await signIn(page);
  await page.goto(`/roster?week=${weekStart}`);

  await expect(page.getByRole("link", { name: "By cleaner" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const cleanerGrid = page.getByRole("region", { name: "Roster by cleaner" });
  await expect(cleanerGrid).toBeVisible();
  const cleanerGapKeys = await attributeSet(
    cleanerGrid.locator("[data-vacancy-key]"),
    "data-vacancy-key",
  );
  const cleanerRepresentedJobIds = await attributeSet(
    cleanerGrid.locator("[data-job-id]"),
    "data-job-id",
  );
  expect(cleanerGapKeys).toEqual(vacancyKeys);
  expect(cleanerRepresentedJobIds).toEqual(jobIds);
  expect(await attributeSet(cleanerGrid.getByTestId("roster-job"), "data-job-id"))
    .not.toEqual([]);

  const bySite = page.getByRole("link", { name: "By site" });
  await expect(bySite).toHaveAttribute("href", `/roster?week=${weekStart}&view=site`);
  await bySite.click();
  await expect(page).toHaveURL(`/roster?week=${weekStart}&view=site`);
  await expect(page.getByRole("link", { name: "By site" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const siteGrid = page.getByRole("region", { name: "Roster by site" });
  await expect(siteGrid).toBeVisible();
  expect(await attributeSet(siteGrid.locator("[data-vacancy-key]"), "data-vacancy-key"))
    .toEqual(vacancyKeys);
  expect(await attributeSet(siteGrid.getByTestId("roster-job"), "data-job-id"))
    .toEqual(jobIds);
  await expect(siteGrid.getByTestId("roster-gap")).toHaveCount(vacancyKeys.length);
  await expect(page.getByTestId("roster-gap-count")).toHaveText(
    `${vacancyKeys.length} unfilled slots`,
  );
  await expect(page.getByTestId("roster-footer-gap-count")).toHaveText(
    `${vacancyKeys.length} unfilled slots this week`,
  );

  const assignedSiteRow = siteGrid.getByRole("row", { name: /Broadbeach Towers/ });
  await expect(assignedSiteRow).toContainText("Demo Cleaner One");
  expect(await assignedSiteRow.getByTestId("roster-gap").count()).toBeGreaterThan(0);

  const emptySiteRow = siteGrid.getByRole("row", { name: /Burleigh Retail/ });
  await expect(emptySiteRow).toBeVisible();
  await expect(emptySiteRow.getByLabel("No work")).toHaveCount(7);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
