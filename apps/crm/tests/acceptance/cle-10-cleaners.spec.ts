import { expect, test } from "@playwright/test";

const adminEmail = "admin@clean-app.example.test";
const demoPassword = "local-demo-only";
const crmOrigin = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100").origin;

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en-AU\/roster$/);
}

test("@CLE-60 lists, creates, copies, and revokes Staff postings", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: crmOrigin,
  });
  await signIn(page);
  await page.goto("/en-AU/cleaners");

  await expect(page.getByRole("heading", { name: "Cleaner staff", level: 1 })).toBeVisible();
  const postings = page.getByRole("list", { name: "Company postings" });
  await expect(postings.getByRole("listitem")).toHaveCount(3);
  await expect(postings).toContainText("Expression of interest");
  await expect(postings).toContainText("One-time opportunity");
  await expect(postings).toContainText("Regular opportunity");

  const members = page.getByRole("list", { name: "Cleaner staff" });
  await expect(members.getByRole("listitem")).toHaveCount(3);
  await expect(members).toContainText("Demo Cleaner One");
  await expect(members).toContainText("Joined 2 Aug 2026");
  await expect(members).toContainText("Demo Cleaner Two");
  await expect(members).toContainText("Joined 3 Aug 2026");
  await expect(members).toContainText("Demo Cleaner Three");
  await expect(members).toContainText("Joined 4 Aug 2026");
  await expect(members).not.toContainText("Demo Company Admin");
  await expect(members).not.toContainText("Demo Removed Cleaner");

  await page.getByRole("link", { name: "Create posting" }).click();
  await expect(page).toHaveURL(/\/en-AU\/cleaners\/postings\/new$/);
  await page.getByRole("radio", { name: "Expression of interest" }).click();
  const description = "Interested in future Gold Coast cleaning work.";
  await page.getByRole("textbox", { name: "Public description" }).fill(description);
  await page.getByRole("button", { name: "Create posting" }).click();
  await expect(page).toHaveURL(/\/en-AU\/cleaners$/);

  const createdPosting = page.getByRole("listitem", { name: description });
  await expect(createdPosting).toContainText("Expression of interest");
  await expect(createdPosting).toContainText("Active");
  await expect(createdPosting).toContainText("No applications");
  const postingLink = createdPosting.getByRole("link");
  const postingUrl = await postingLink.getAttribute("href");
  expect(postingUrl).toMatch(/^http:\/\/127\.0\.0\.1:3001\/join\?code=[A-Z0-9]{16}$/);

  await createdPosting.getByRole("button", { name: `Copy link for ${description}` }).click();
  await expect(page.getByRole("status")).toContainText("Posting link copied.");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(postingUrl);

  await createdPosting.getByRole("button", { name: `Revoke ${description}` }).click();
  await expect(createdPosting).toContainText("Closed · Revoked");
  await expect(createdPosting.getByRole("button", { name: /replace|regenerate/i })).toHaveCount(0);
});
