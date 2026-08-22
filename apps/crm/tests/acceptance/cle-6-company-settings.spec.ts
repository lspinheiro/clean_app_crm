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

test.describe("@CLE-6 company identity settings", () => {
  test("shows persisted identity and the fixed Brisbane timezone", async ({ page }) => {
    await signIn(page);
    await page.goto("/en-AU/settings");

    await expect(page.getByLabel("Company name")).toHaveValue("Coastal Demo Cleaning");
    await expect(page.getByLabel("ABN")).toHaveValue("51824753556");
    await expect(page.getByText("Timezone · Australia/Brisbane")).toBeVisible();
  });

  test("renders an invalid ABN error inline", async ({ page }) => {
    await signIn(page);
    await page.goto("/en-AU/settings");
    await page.getByLabel("ABN").fill("123");
    await page.getByRole("button", { name: "Save business identity" }).click();

    await expect(page.getByText("Enter exactly 11 digits.")).toBeVisible();
  });

  test("persists identity edits across reloads and into the shell", async ({ page }) => {
    await signIn(page);
    await page.goto("/en-AU/settings");
    await page.getByLabel("Company name").fill("Coastal Demo Services");
    await page.getByLabel("ABN").fill("12345678901");
    await page.getByRole("button", { name: "Save business identity" }).click();

    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Company name")).toHaveValue("Coastal Demo Services");
    await expect(page.getByLabel("ABN")).toHaveValue("12345678901");
    await expect(page.getByRole("button", {
      name: "Current company: Coastal Demo Services",
    })).toBeVisible();

    await page.getByLabel("Company name").fill("Coastal Demo Cleaning");
    await page.getByLabel("ABN").fill("51824753556");
    await page.getByRole("button", { name: "Save business identity" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("compresses a logo, persists it, and renders it in the shell", async ({ page }) => {
    await signIn(page);
    await page.goto("/en-AU/settings");

    const encodedLogo = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 900;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.fillStyle = "#00c2ff";
      context.fillRect(0, 0, 900, 900);
      context.fillStyle = "#000000";
      context.font = "bold 320px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("CA", 450, 450);
      return canvas.toDataURL("image/png").split(",")[1];
    });

    // Confirm the client boundary is hydrated before dispatching the file input's
    // single change event. Text entry naturally retries across hydration; an upload does not.
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.keyboard.press("Escape");
    await page.locator("#company-logo").setInputFiles({
      name: "coastal-demo.png",
      mimeType: "image/png",
      buffer: Buffer.from(encodedLogo, "base64"),
    });
    await page.getByRole("button", { name: "Save business identity" }).click();

    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("img", { name: "Coastal Demo Cleaning logo" })).toHaveCount(2);
  });
});
