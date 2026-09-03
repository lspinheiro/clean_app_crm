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

test("@CLE-42 preloads the local Inter face used on first roster paint", async ({ page }) => {
  const fontResponses: Array<{ status: number; url: string }> = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.endsWith(".woff2")) {
      fontResponses.push({ status: response.status(), url: response.url() });
    }
  });
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Roster", level: 1 })).toBeVisible();

  const fontState = await page.evaluate(async () => {
    await document.fonts.ready;
    const heading = document.querySelector("h1");
    if (!heading) throw new Error("Roster heading is unavailable.");
    const familyVariable = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-inter")
      .trim();
    const primaryFamily = familyVariable.split(",")[0]?.replaceAll(/["']/g, "").trim() ?? "";
    const headingStyle = getComputedStyle(heading);
    const headingWeight = headingStyle.fontWeight;
    const matchingFaces = [...document.fonts].filter((face) => (
      face.family.replaceAll(/["']/g, "").trim() === primaryFamily
    ));
    const loadedHeadingFaces = matchingFaces.filter((face) => (
      face.status === "loaded"
      && face.weight === headingWeight
      && face.style === headingStyle.fontStyle
    ));
    const headingDisplayModes: string[] = [];
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
          && rule.style.getPropertyValue("font-weight") === headingWeight
          && rule.style.getPropertyValue("font-style") === headingStyle.fontStyle
        ) {
          headingDisplayModes.push(rule.style.getPropertyValue("font-display"));
        }
      }
    }
    return {
      familyVariable,
      headingFamily: headingStyle.fontFamily,
      headingWeight,
      loadedHeadingFaces: loadedHeadingFaces.length,
      headingDisplayModes,
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
  expect(fontState.headingWeight).toBe("800");
  expect(fontState.loadedHeadingFaces).toBeGreaterThan(0);
  expect(fontState.headingDisplayModes).toContain("optional");
  expect(fontResponses.some((response) => response.status >= 200 && response.status < 300))
    .toBe(true);
  // Next 16's webpack font-manifest plugin matches loader requests with forward slashes
  // only (next-font-manifest-plugin.js:60), while Windows builds them with path.join
  // (webpack-config.js:1080). The manifest's app map comes out empty and no preload tag is
  // emitted -- on Windows + webpack alone. Production and the Turbopack dev server both
  // emit it, and the daily release runs this suite on ubuntu-latest, so the assertion still
  // guards the real target everywhere it can be true. Every other assertion above stays
  // live on Windows, which is why this is a conditional rather than test.skip().
  if (process.platform !== "win32") {
    await expect(page.locator('link[rel="preload"][as="font"]')).not.toHaveCount(0);
  }
});
