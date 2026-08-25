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

test.describe("@CLE-86 application approval", () => {
  test("reviews, restores, and approves from the bilingual queue-first workspace", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await page.goto("/en-AU/jobs");

    const awaitingJob = page
      .getByRole("list", { name: "Company jobs" })
      .getByRole("listitem")
      .filter({ hasText: "2 awaiting review" })
      .first();
    await expect(awaitingJob).toContainText("Broadbeach Towers");
    const href = await awaitingJob.getByRole("link").getAttribute("href");
    expect(href).toMatch(/^\/en-AU\/jobs\/[0-9a-f-]+$/);
    const jobPath = href?.replace(/^\/en-AU/, "");

    await page.goto(`/pt-BR${jobPath}`);
    await expect(page.getByRole("heading", { name: "Candidaturas" })).toBeVisible();
    await expect(page.getByText(/A aprovação aloca .* imediatamente/).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Aguardando análise" }))
      .toBeVisible();

    await page.goto(`/en-AU${jobPath}`);
    const applications = page.getByRole("heading", { name: "Applications" });
    const crew = page.getByRole("heading", { name: "Crew slots" });
    expect(await applications.evaluate((node) =>
      Boolean(node.compareDocumentPosition(
        document.querySelector("#job-crew-heading") as Node,
      ) & Node.DOCUMENT_POSITION_FOLLOWING)
    )).toBe(true);
    await expect(page.getByText("1 open slot · 2 awaiting review")).toBeVisible();

    const thirdCleanerApplication = page.getByRole("article", {
      name: "Demo Cleaner Three",
    });
    await thirdCleanerApplication.locator("summary").click();
    await expect(page.getByRole("article", { name: "Demo Cleaner Two" }).locator("details"))
      .not.toHaveAttribute("open", "");
    await thirdCleanerApplication.getByRole("button", {
      name: "Mark Demo Cleaner Three not selected",
    }).click();
    const resolved = page.getByRole("region", { name: "Resolved responses" });
    await expect(resolved.getByText("Demo Cleaner Three", { exact: true })).toBeVisible();
    await resolved.getByRole("button", { name: "Restore Demo Cleaner Three" }).click();
    await expect(page.getByText("1 open slot · 2 awaiting review")).toBeVisible();

    const secondCleanerApplication = page.getByRole("article", {
      name: "Demo Cleaner Two",
    });
    await secondCleanerApplication.locator("summary").click();
    await page.getByLabel("Crew slot for Demo Cleaner Two").selectOption("2");
    await page.getByRole("button", {
      name: "Approve Demo Cleaner Two for slot 2",
    }).click();
    await expect(page.getByText("2/2 assigned")).toBeVisible();
    await expect(page.getByRole("region", { name: "Resolved responses" }))
      .toContainText("Demo Cleaner Two");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Broadbeach Towers" })).toBeVisible();
    expect(await page.locator("body").evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(390);
    const actionHeights = await page.locator("#main-content").getByRole("button")
      .evaluateAll((buttons) =>
      buttons
        .filter((button) => button.getClientRects().length > 0)
        .map((button) => button.getBoundingClientRect().height)
      );
    expect(actionHeights.every((height) => height >= 44)).toBe(true);
    await expect(crew).toBeVisible();
  });
});
