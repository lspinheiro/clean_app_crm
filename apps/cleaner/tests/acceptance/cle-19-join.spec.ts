import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Runs against the seeded local database (`pnpm db:reset`). Posting codes replaced the
// retired rotating company-invite codes in CLE-59.
const activeCode = "DEMOEOIPOST00001";
const oneTimeCode = "DEMOJOBPOST00001";
const retiredInviteCode = "ZOLD01";
const unknownCode = "NOPE12";
const companyName = "Coastal Demo Cleaning";
const sameCompanyEmployeeEmail = "owner.harbour@clean-app.example.test";
const noCleanerMembershipEmail = "new.employee@clean-app.example.test";
// CLE-111: a second company trades under `companyName` too; this candidate was rejected by
// the first one and must stay free to apply to the second.
const twinCompanyCode = "DEMOTWINPOST0001";
const rejectedCandidateEmail = "twin.candidate@clean-app.example.test";
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

async function readJoinEvidence(fullName: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase acceptance environment is not configured.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, phone, suburb")
    .eq("full_name", fullName)
    .single();
  if (profileError) throw profileError;
  const { data: request, error: requestError } = await supabase
    .from("join_requests")
    .select("id, note, state")
    .eq("profile_id", profile.id)
    .single();
  if (requestError) throw requestError;
  const { count, error: applicationError } = await supabase
    .from("job_applications")
    .select("id", { count: "exact", head: true })
    .eq("join_request_id", request.id);
  if (applicationError) throw applicationError;
  return {
    applicationCount: count,
    note: request.note,
    phone: profile.phone,
    state: request.state,
    suburb: profile.suburb,
  };
}

test.describe("@CLE-19 @CLE-61 requesting to join from a posting", () => {
  test("registers a cleaner, sends the request note, and shows the persisted waiting state", async ({ page }) => {
    await page.goto(`${localizedPath("/join")}?code=${activeCode}`);

    await expect(page.getByText(companyName, { exact: true })).toBeVisible();
    await expect(page.getByText("Register your interest in joining our cleaner staff.")).toBeVisible();

    await page.getByLabel("Full name").fill("Ana Silva");
    await page.getByLabel("Email").fill(newCleanerEmail());
    await page.getByLabel("Password").fill(demoPassword);
    await page.getByLabel("Phone").fill("0400 000 111");
    await page.getByLabel("Suburb").fill("Southport");
    await page.getByLabel("Note to the cleaning company (optional)").fill("Available from Monday");
    await page.getByRole("button", { name: "Send request" }).click();

    await expect(page.getByRole("heading", { name: "Request sent" })).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Request waiting" })).toBeVisible();
    await expect(page.getByText("Your request to join is waiting for the cleaning company.")).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveCount(0);
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
    await page.getByRole("button", { name: "Send request" }).click();

    await expect(page.getByRole("heading", { name: "Request sent" })).toBeVisible();
  });

  test("a candidate rejected by one company can still apply to a same-named other company", async ({ page }) => {
    await page.goto(`${localizedPath("/join")}?code=${twinCompanyCode}`);
    await page.getByRole("link", { name: "Sign in to join" }).click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?code=${twinCompanyCode}$`));
    await waitForLoginFormHydration(page);
    await page.getByLabel("Email").fill(rejectedCandidateEmail);
    await page.getByLabel("Password").fill(demoPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/join\\?code=${twinCompanyCode}$`));

    // The rejection belongs to the other company that trades under this same display name.
    // Matching on the name would suppress the form and lose the candidate silently.
    await expect(page.getByText("This cleaning company closed your request.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
    await expect(page.getByLabel("Note to the cleaning company (optional)")).toBeVisible();
  });

  test("the company that rejected a candidate still shows her the closed request", async ({ page }) => {
    await page.goto(`${localizedPath("/join")}?code=${activeCode}`);
    await page.getByRole("link", { name: "Sign in to join" }).click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?code=${activeCode}$`));
    await waitForLoginFormHydration(page);
    await page.getByLabel("Email").fill(rejectedCandidateEmail);
    await page.getByLabel("Password").fill(demoPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/join\\?code=${activeCode}$`));
    await expect(page.getByText("This cleaning company closed your request.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send request" })).toHaveCount(0);
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

  test("does not resolve a retired legacy invite through the posting page", async ({ page }) => {
    await page.goto(`${localizedPath("/join")}?code=${retiredInviteCode}`);

    await expect(page.locator(".invite-problem")).toContainText("We do not know this posting link");
    await expect(page.locator(".invite-problem")).not.toContainText(companyName);
    await expect(page.getByLabel("Full name")).toHaveCount(0);
  });

  test("shows a job-bound posting from public fields without leaking assignment-gated details", async ({ page }) => {
    await page.goto(`${localizedPath("/join")}?code=${oneTimeCode}`);

    await expect(page.getByRole("heading", { name: "One-time cleaning opportunity" })).toBeVisible();
    await expect(page.getByText("Broadbeach")).toBeVisible();
    await expect(page.getByText("$120")).toBeVisible();
    await expect(page.getByText("A one-time crew place on the upcoming roster.")).toBeVisible();
    await expect(page.getByText("10 Surf Parade")).toHaveCount(0);
    await expect(page.getByText("Demo access notes — company admin only")).toHaveCount(0);
    await expect(page.getByText("07 5555 0101")).toHaveCount(0);
  });

  test("registration from a job-bound posting persists one request, its note, and the application", async ({ page }) => {
    const fullName = `Job Posting Candidate ${Date.now()}`;
    await page.goto(`${localizedPath("/join")}?code=${oneTimeCode}`);

    await page.getByLabel("Full name").fill(fullName);
    await page.getByLabel("Email").fill(newCleanerEmail());
    await page.getByLabel("Password").fill(demoPassword);
    await page.getByLabel("Phone").fill("0400 000 222");
    await page.getByLabel("Suburb").fill("Miami");
    await page.getByLabel("Note to the cleaning company (optional)").fill("Available for this shift");
    await page.getByRole("button", { name: "Apply for this job" }).click();

    await expect(page.getByRole("heading", { name: "Application sent" })).toBeVisible();
    await expect(page.getByText("The cleaning company can now review your application.")).toBeVisible();
    expect(await readJoinEvidence(fullName)).toEqual({
      applicationCount: 1,
      note: "Available for this shift",
      phone: "0400 000 222",
      state: "waiting",
      suburb: "Miami",
    });
  });

  test("explains a link it does not know", async ({ page }) => {
    await page.goto(`${localizedPath("/join")}?code=${unknownCode}`);

    await expect(page.locator(".invite-problem")).toContainText("We do not know this posting link");
    await expect(page.getByLabel("Full name")).toHaveCount(0);
  });

  test("explains a link with no code at all", async ({ page }) => {
    await page.goto(localizedPath("/join"));

    await expect(page.locator(".invite-problem")).toContainText("posting link");
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
