import { expect, test } from "@playwright/test";

const demoPassword = "local-demo-only";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signOut(page: import("@playwright/test").Page) {
  const signOutButton = page.getByRole("button", { name: "Sign out" });
  if (!(await signOutButton.isVisible())) {
    await page.getByRole("button", { name: "Account menu" }).click();
  }
  await signOutButton.click();
}

test.describe("@CLE-83 owner employee invitations", () => {
  test("an owner chooses a role and sees every invitation state without resend or bulk controls", async ({
    page,
  }) => {
    await signIn(page, "admin@clean-app.example.test");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("link", { name: "Settings" }).click();

    const invitations = page.getByRole("region", { name: "Invite an employee" });
    await expect(invitations).toBeVisible();
    await expect(invitations.getByRole("combobox", { name: "Company access", exact: true }))
      .toHaveValue("staff");
    await expect(invitations.getByRole("option", { name: "Owner" })).toHaveCount(1);
    for (const state of ["Pending", "Accepted", "Expired", "Revoked"]) {
      await expect(invitations.getByText(state, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/resend/i)).toHaveCount(0);
    await expect(page.getByText(/bulk/i)).toHaveCount(0);
  });

  test("staff can manage personal settings and view company identity without admin controls", async ({
    page,
  }) => {
    await signIn(page, "owner.harbour@clean-app.example.test");
    await expect(page).toHaveURL(/\/en-AU\/roster$/);
    const currentCompany = page.getByRole("button", { name: /^Current company:/ });
    await expect(currentCompany).toBeVisible();
    if ((await currentCompany.getAttribute("aria-label"))?.includes("Harbour Demo Cleaning")) {
      await currentCompany.click();
      const switchToCoastal = page.getByRole("button", {
        name: "Switch to Coastal Demo Cleaning",
      });
      await switchToCoastal.click();
    }

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/en-AU\/settings$/);
    await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Language" })).toBeVisible();
    const identity = page.getByRole("region", { name: "Business identity" });
    await expect(identity.getByText("Coastal Demo Cleaning")).toBeVisible();
    await expect(identity.getByText("Only owners can edit company details.")).toBeVisible();
    await expect(identity.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Company access" })).toHaveCount(0);
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
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await signOut(page);
    await page.getByLabel("Email").fill("new.employee@clean-app.example.test");
    await page.getByLabel("Password").fill("new-local-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en-AU\/roster$/);
  });

  // CLE-91: these used to share one sentence with "not signed in" and "signed in as somebody
  // else", which is why nobody who hit it could tell what to do next. Each state says what
  // happened now, so asserting the specific heading is the point rather than an incidental
  // detail.
  test("a withdrawn invitation says it was withdrawn", async ({ page }) => {
    await signIn(page, "cleaner.two@clean-app.example.test");
    await expect(page).toHaveURL(/\/en-AU\/no-company-access$/);

    await page.goto(
      "/en-AU/invite/accept?employeeInvitation=83000000-0000-4000-8000-000000000203",
    );

    await expect(page.getByRole("heading", { name: "This invitation was withdrawn" }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  });

  test("an expired invitation says it expired", async ({ page }) => {
    await signIn(page, "cleaner.two@clean-app.example.test");
    await expect(page).toHaveURL(/\/en-AU\/no-company-access$/);

    await page.goto(
      "/en-AU/invite/accept?employeeInvitation=83000000-0000-4000-8000-000000000204",
    );

    await expect(page.getByRole("heading", { name: "This invitation has expired" }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  });
});
