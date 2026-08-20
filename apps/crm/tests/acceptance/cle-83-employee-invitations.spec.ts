import { expect, test } from "@playwright/test";

const demoPassword = "local-demo-only";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signOut(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
}

test.describe("@CLE-83 owner employee invitations", () => {
  test("an owner chooses a role and sees every invitation state without resend or bulk controls", async ({
    page,
  }) => {
    await signIn(page, "admin@clean-app.example.test");
    await page.getByRole("link", { name: "Company settings" }).click();

    await expect(page.getByRole("heading", { name: "Invite an employee" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Role" })).toHaveValue("staff");
    await expect(page.getByRole("option", { name: "Owner" })).toHaveCount(1);
    for (const state of ["Pending", "Accepted", "Expired", "Revoked"]) {
      await expect(page.getByText(state, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/resend/i)).toHaveCount(0);
    await expect(page.getByText(/bulk/i)).toHaveCount(0);
  });

  test("staff has neither the settings affordance nor direct route access in its active company", async ({
    page,
  }) => {
    await signIn(page, "owner.harbour@clean-app.example.test");
    await expect(page).toHaveURL(/\/en-AU\/roster$/);
    await page.getByRole("button", { name: "Account menu" }).click();
    const switchToCoastal = page.getByRole("button", { name: "Switch to Coastal Demo Cleaning" });
    if (await switchToCoastal.count()) {
      await switchToCoastal.click();
      await expect(page.getByRole("link", { name: "Company settings" })).toHaveCount(0);
    } else {
      await page.getByRole("button", { name: "Account menu" }).click();
    }

    await expect(page.getByRole("link", { name: "Company settings" })).toHaveCount(0);
    await page.goto("/en-AU/settings");
    await expect(page).toHaveURL(/\/en-AU\/login\?error=not-authorised$/);
    await expect(page.getByRole("heading", { name: "Invite an employee" })).toHaveCount(0);
  });

  test("an existing cleaner signs in, accepts as staff, and keeps the same login", async ({
    page,
  }) => {
    await page.goto(
      "/en-AU/invite/accept?employeeInvitation=83000000-0000-4000-8000-000000000201",
    );
    await page.getByRole("link", { name: "Sign in" }).click();
    await page.getByLabel("Email").fill("cleaner.one@clean-app.example.test");
    await page.getByLabel("Password").fill(demoPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: "Join Coastal Demo Cleaning" }))
      .toBeVisible();
    await expect(page.getByText("Staff", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page).toHaveURL(/\/en-AU\/roster$/);
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

    await signOut(page);
    await signIn(page, "cleaner.one@clean-app.example.test");
    await expect(page).toHaveURL(/\/en-AU\/roster$/);
  });

  test("a newly invited email completes account setup and lands with the chosen owner role", async ({
    page,
  }) => {
    await signIn(page, "new.employee@clean-app.example.test");
    await expect(page).toHaveURL(/\/en-AU\/no-company-access$/);
    await page.goto(
      "/en-AU/invite/accept?employeeInvitation=83000000-0000-4000-8000-000000000206",
    );

    await expect(page.getByRole("heading", { name: "Join Coastal Demo Cleaning" }))
      .toBeVisible();
    await expect(page.getByText("Owner", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Full name" }).fill("New Employee");
    await page.getByRole("combobox", { name: "Language" }).selectOption("en-AU");
    await page.getByLabel("Password", { exact: true }).fill("new-local-password");
    await page.getByLabel("Confirm password").fill("new-local-password");
    await page.getByRole("button", { name: "Accept invitation" }).click();

    await expect(page).toHaveURL(/\/en-AU\/roster$/);
    await expect(page.getByRole("link", { name: "Company settings" })).toBeVisible();
    await signOut(page);
    await page.getByLabel("Email").fill("new.employee@clean-app.example.test");
    await page.getByLabel("Password").fill("new-local-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en-AU\/roster$/);
  });

  test("revoked and expired invitations remain unavailable", async ({ page }) => {
    await signIn(page, "cleaner.two@clean-app.example.test");
    await expect(page).toHaveURL(/\/en-AU\/no-company-access$/);

    for (const invitationId of [
      "83000000-0000-4000-8000-000000000203",
      "83000000-0000-4000-8000-000000000204",
    ]) {
      await page.goto(`/en-AU/invite/accept?employeeInvitation=${invitationId}`);
      await expect(page.getByRole("heading", { name: "This invitation is not available" }))
        .toBeVisible();
      await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
    }
  });
});
