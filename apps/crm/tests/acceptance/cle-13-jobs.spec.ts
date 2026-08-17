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

    const crewJob = jobs
      .getByRole("listitem")
      .filter({ hasText: "Broadbeach Towers" })
      .filter({ hasText: "Posted" })
      .filter({ hasText: "1/2 assigned" })
      .first();
    await expect(crewJob).toContainText("Posted");
    await expect(crewJob).toContainText("1/2 assigned");

    const assignedJob = jobs
      .getByRole("listitem")
      .filter({ hasText: "Southport Office" })
      .filter({ hasText: "Assigned" })
      .filter({ hasText: "1/1 assigned" })
      .first();
    await expect(assignedJob).toContainText("Assigned");
    await expect(assignedJob).toContainText("1/1 assigned");

    const openJob = jobs
      .getByRole("listitem")
      .filter({ hasText: "Palm Grove Practice" })
      .filter({ hasText: "Posted" })
      .filter({ hasText: "0/1 assigned" })
      .first();
    await expect(openJob).toContainText("Posted");
    await expect(openJob).toContainText("0/1 assigned");
  });
});
