import { expect, test } from "@playwright/test";

const adminEmail = "admin@clean-app.example.test";
const cleanerEmail = "cleaner.one@clean-app.example.test";
const demoPassword = "local-demo-only";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("@CLE-5 company-admin sign-in and shell", () => {
  test("seeded company admin sees the five CRM destinations", async ({ page }) => {
    await signIn(page, adminEmail, demoPassword);

    await expect(page).toHaveURL(/\/en-AU\/roster$/);
    for (const label of ["Roster", "Jobs", "Clients", "Pool", "Money"]) {
      await expect(page.getByRole("navigation").getByRole("link", { name: label })).toHaveCount(1);
    }
  });

  test("anonymous deep links never render the protected shell", async ({ page }) => {
    await page.goto("/en-AU/clients");

    await expect(page).toHaveURL(/\/en-AU\/login\?error=not-authorised$/);
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  test("an account without employee membership gets guidance without exposing the shell", async ({ page }) => {
    await signIn(page, cleanerEmail, demoPassword);

    await expect(page).toHaveURL(/\/en-AU\/no-company-access$/);
    await expect(page.getByRole("heading", { name: "No company access" })).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  test("invalid credentials keep the protected shell hidden", async ({ page }) => {
    await signIn(page, adminEmail, "not-the-password");

    await expect(page.locator(".form-error")).toContainText("incorrect");
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  test("the invite-only alpha exposes no signup route or call to action", async ({ page }) => {
    await page.goto("/en-AU/login");
    await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
    await page.goto("/en-AU/signup");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
