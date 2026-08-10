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
  const fontResponses: Array<{ status: number; url: string }> = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.endsWith(".woff2")) {
      fontResponses.push({ status: response.status(), url: response.url() });
    }
  });
  await signIn(page);

  const fontState = await page.evaluate(async () => {
    await document.fonts.ready;
    const heading = document.querySelector("h1");
    if (!heading) throw new Error("Roster heading is unavailable.");
    const familyVariable = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-poppins")
      .trim();
    const primaryFamily = familyVariable.split(",")[0]?.replaceAll(/["']/g, "").trim() ?? "";
    const matchingFaces = [...document.fonts].filter((face) => (
      face.family.replaceAll(/["']/g, "").trim() === primaryFamily
    ));
    const displayModes: string[] = [];
    for (const sheet of [...document.styleSheets]) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of [...rules]) {
        if (
          rule instanceof CSSFontFaceRule
          && rule.style.getPropertyValue("font-family").replaceAll(/["']/g, "").trim()
            === primaryFamily
        ) {
          displayModes.push(rule.style.getPropertyValue("font-display"));
        }
      }
    }
    return {
      familyVariable,
      headingFamily: getComputedStyle(heading).fontFamily,
      loadedMatchingFaces: matchingFaces.filter((face) => face.status === "loaded").length,
      displayModes,
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
  expect(fontState.loadedMatchingFaces).toBeGreaterThan(0);
  expect(fontState.displayModes).toContain("optional");
  expect(fontResponses.some((response) => response.status >= 200 && response.status < 300))
    .toBe(true);
  await expect(page.locator('link[rel="preload"][as="font"]')).not.toHaveCount(0);
});
