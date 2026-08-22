import { expect, test, type Page } from "@playwright/test";

// Runs against the seeded local database (`pnpm db:reset`). CLEAN1DEMOJOIN99 is the demo company's
// active invite; ZOLD01 is a superseded one kept in the seed so the error state is testable
// without rotating the live code out from under the other suites.
const activeCode = "CLEAN1DEMOJOIN99";
const supersededCode = "ZOLD01";
const unknownCode = "NOPE12";
const companyName = "Coastal Demo Cleaning";
const sameCompanyEmployeeEmail = "owner.harbour@clean-app.example.test";
const noCleanerMembershipEmail = "new.employee@clean-app.example.test";
const demoPassword = "local-demo-only";
const locale = "en-AU";

function localizedPath(path: string) {
  return `/${locale}${path}`;
}

function newCleanerEmail() {
  return `ana.${Date.now()}.${Math.floor(Math.random() * 1000)}@example.test`;
}

async function waitForLoginFormHydration(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return form !== null && Object.keys(form).some((key) => key.startsWith("__reactProps$"));
  });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto(localizedPath("/login"));
  await waitForLoginFormHydration(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("@CLE-19 joining a company from the invite link", () => {
  test("registers a cleaner and lands on the board", async ({ page }) => {
    await page.goto(`${localizedPath("/join")}?code=${activeCode}`);

    await expect(page.getByText(companyName)).toBeVisible();
    await expect(page.getByText(/\d+ cleaners? (?:is|are) already on their staff\./)).toBeVisible();

    await page.getByLabel("Full name").fill("Ana Silva");
    await page.getByLabel("Email").fill(newCleanerEmail());
    await page.getByLabel("Password").fill(demoPassword);
    await page.getByLabel("Phone").fill("0400 000 111");
    await page.getByLabel("Suburb").fill("Southport");
    await page.getByRole("button", { name: "Join the Cleaner staff" }).click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/board$`));
    await expect(page.getByRole("heading", { name: "Open jobs", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Get job updates" })).toBeVisible();

    // Push is offered after this successful join, but it is never a gate to the board.
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("heading", { name: "Get job updates" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Open jobs", level: 1 })).toBeVisible();

    // Reloading proves the name and suburb were written to the profile, not just rendered
    // once from the submitted form. It also proves declining push is remembered rather than
    // prompting on every board visit. The cleaner membership itself is asserted in pgTAP.
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${locale}/board$`));
    await expect(page.getByRole("heading", { name: "Open jobs", level: 1 })).toBeVisible();
    await expect(page.getByText("Ana Silva · Southport")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Get job updates" })).toHaveCount(0);
  });

  test("an existing employee signs in and joins the same company's Cleaner staff", async ({ page }) => {
    await page.goto(`${localizedPath("/join")}?code=${activeCode}`);
    await page.getByRole("link", { name: "Sign in to join" }).click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?code=${activeCode}$`));
    await waitForLoginFormHydration(page);
    await page.getByLabel("Email").fill(sameCompanyEmployeeEmail);
    await page.getByLabel("Password").fill(demoPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/join\\?code=${activeCode}$`));
    await expect(page.getByText(sameCompanyEmployeeEmail)).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("Harbour Demo Owner");
    await page.getByLabel("Phone").fill("0400 000 606");
    await page.getByLabel("Suburb").fill("Robina");
    await page.getByRole("button", { name: "Join the Cleaner staff" }).click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/board$`));
    await expect(page.getByRole("heading", { name: "Open jobs", level: 1 })).toBeVisible();
  });

  test("invalid existing-account credentials preserve the invitation", async ({ page }) => {
    await page.goto(`${localizedPath("/join")}?code=${activeCode}`);
    await page.getByRole("link", { name: "Sign in to join" }).click();

    // Wait for the client-side navigation before touching the fields: /join carries its
    // own "Email" input for the sign-up form, so filling too early silently types into
    // the page being navigated away from and submits an empty login form.
    await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?code=${activeCode}$`));
    await waitForLoginFormHydration(page);
    await page.getByLabel("Email").fill(sameCompanyEmployeeEmail);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator(".form-error")).toContainText("incorrect");
    await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?code=${activeCode}$`));
  });

  test("explains a superseded link instead of failing", async ({ page }) => {
    await page.goto(`${localizedPath("/join")}?code=${supersededCode}`);

    await expect(page.locator(".invite-problem")).toContainText("no longer in use");
    // A dead code must not answer "which company was this?" for whoever holds it.
    await expect(page.locator(".invite-problem")).not.toContainText(companyName);
    await expect(page.getByLabel("Full name")).toHaveCount(0);
  });

  test("explains a link it does not know", async ({ page }) => {
    await page.goto(`${localizedPath("/join")}?code=${unknownCode}`);

    await expect(page.locator(".invite-problem")).toContainText("We do not know this invite link");
    await expect(page.getByLabel("Full name")).toHaveCount(0);
  });

  test("explains a link with no code at all", async ({ page }) => {
    await page.goto(localizedPath("/join"));

    await expect(page.locator(".invite-problem")).toContainText("invite link");
    await expect(page.getByLabel("Full name")).toHaveCount(0);
  });
});

test.describe("@CLE-19 cleaner app route guard", () => {
  test("anonymous deep links never render the board", async ({ page }) => {
    await page.goto(localizedPath("/board"));

    await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?error=not-authorised$`));
    await expect(page.getByRole("heading", { name: "Open jobs" })).toHaveCount(0);
  });

  test("an account without a cleaner membership is refused without exposing the board", async ({ page }) => {
    await signIn(page, noCleanerMembershipEmail, demoPassword);

    await expect(page.locator(".form-error")).toContainText("for cleaners");
    await expect(page.getByRole("heading", { name: "Open jobs" })).toHaveCount(0);
  });

  test("a seeded cleaner signs in and reaches the board", async ({ page }) => {
    await signIn(page, "cleaner.one@clean-app.example.test", demoPassword);

    await expect(page).toHaveURL(new RegExp(`/${locale}/board$`));
    await expect(page.getByRole("heading", { name: "Open jobs", level: 1 })).toBeVisible();
  });

  test("invalid credentials keep the board hidden", async ({ page }) => {
    await signIn(page, "cleaner.one@clean-app.example.test", "not-the-password");

    await expect(page.locator(".form-error")).toContainText("incorrect");
    await expect(page.getByRole("heading", { name: "Open jobs" })).toHaveCount(0);
  });
});
