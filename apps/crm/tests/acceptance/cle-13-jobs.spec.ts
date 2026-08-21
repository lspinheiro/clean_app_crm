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

test.describe("@CLE-13 jobs with crew slots", () => {
  test("lists seeded jobs with status and per-slot staffing counts", async ({ page }) => {
    await signIn(page);
    await page.goto("/en-AU/jobs");

    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
    await expect(page).toHaveTitle("Jobs · The Clean Crew");
    const jobs = page.getByRole("list", { name: "Company jobs" });
    expect(await jobs.getByRole("listitem").count()).toBeGreaterThanOrEqual(3);

    const broadbeachJobs = jobs
      .getByRole("listitem")
      .filter({ hasText: "Broadbeach Towers" });
    // Which upcoming Broadbeach job comes first depends on the weekday the seed ran, so
    // assert on the staffing states themselves rather than on a positional guess.
    const broadbeachRows = await broadbeachJobs.evaluateAll((items) =>
      items.map((item) => ({
        scheduledStart: item.querySelector("time")?.getAttribute("datetime") ?? "",
        text: item.textContent ?? "",
      })),
    );
    const upcoming = broadbeachRows.filter(
      (row) => Date.parse(row.scheduledStart) > Date.now(),
    );
    expect(upcoming.length).toBeGreaterThanOrEqual(2);
    expect(
      upcoming.some((row) => row.text.includes("Posted") && row.text.includes("1/2 assigned")),
    ).toBe(true);
    expect(
      upcoming.some((row) => row.text.includes("Assigned") && row.text.includes("2/2 assigned")),
    ).toBe(true);

    const assignedJob = jobs
      .getByRole("listitem")
      .filter({ hasText: "Southport Office" })
      .first();
    await expect(assignedJob).toContainText("Assigned");
    await expect(assignedJob).toContainText("1/1 assigned");

    // Palm Grove carries both a fully crewed demo job and the uncrewed recurring one, and
    // which of them falls first moves with the calendar, so match on the staffing state.
    const openJob = jobs
      .getByRole("listitem")
      .filter({ hasText: "Palm Grove Practice" })
      .filter({ hasText: "0/1 assigned" })
      .first();
    await expect(openJob).toContainText("Posted");
  });
});
