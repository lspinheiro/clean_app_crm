import { expect, test } from "@playwright/test";

const adminEmail = "admin@clean-app.example.test";
const demoPassword = "local-demo-only";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/roster$/);
}

test.describe("@CLE-13 jobs with crew slots", () => {
  test("lists seeded jobs with status and per-slot staffing counts", async ({ page }) => {
    await signIn(page);
    await page.goto("/jobs");

    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
    const jobs = page.getByRole("list", { name: "Company jobs" });
    await expect(jobs.getByRole("listitem")).toHaveCount(3);

    const crewJob = jobs.getByRole("listitem").filter({ hasText: "Broadbeach Towers" });
    await expect(crewJob).toContainText("Posted");
    await expect(crewJob).toContainText("1/2 assigned");

    const assignedJob = jobs.getByRole("listitem").filter({ hasText: "Southport Office" });
    await expect(assignedJob).toContainText("Assigned");
    await expect(assignedJob).toContainText("1/1 assigned");

    const openJob = jobs.getByRole("listitem").filter({ hasText: "Palm Grove Practice" });
    await expect(openJob).toContainText("Posted");
    await expect(openJob).toContainText("0/1 assigned");
  });
});
