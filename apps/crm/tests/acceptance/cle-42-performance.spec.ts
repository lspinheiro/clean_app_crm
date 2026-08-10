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

test("@CLE-42 preloads the local Poppins face used on first roster paint", async ({ page }) => {
  await signIn(page);

  const fontState = await page.evaluate(async () => {
    await document.fonts.ready;
    const heading = document.querySelector("h1");
    if (!heading) throw new Error("Roster heading is unavailable.");
    return {
      familyVariable: getComputedStyle(document.documentElement)
        .getPropertyValue("--font-poppins")
        .trim(),
      headingFamily: getComputedStyle(heading).fontFamily,
      status: document.fonts.status,
    };
  });

  expect(fontState.status).toBe("loaded");
  expect(fontState.familyVariable).not.toBe("");
  const primaryFamily = fontState.familyVariable
    .split(",")[0]
    ?.replaceAll(/["']/g, "")
    .trim();
  expect(primaryFamily).toBeTruthy();
  expect(fontState.headingFamily.toLowerCase()).toContain(primaryFamily?.toLowerCase());
  await expect(page.locator('link[rel="preload"][as="font"]')).not.toHaveCount(0);
});
