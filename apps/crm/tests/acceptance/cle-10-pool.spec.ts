import { expect, test } from "@playwright/test";

const adminEmail = "admin@clean-app.example.test";
const demoPassword = "local-demo-only";
const cleanerAppUrl = "http://127.0.0.1:3001";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/roster$/);
}

test("@CLE-10 displays, copies, and rotates the active pool invite", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3100",
  });
  await signIn(page);
  await page.goto("/pool");

  await expect(page.getByRole("heading", { name: "Cleaner pool", level: 1 })).toBeVisible();
  const code = page.getByTestId("invite-code");
  await expect(code).toHaveText(/^[A-Z0-9]{6}$/);
  const initialCode = (await code.textContent()) ?? "";
  const joinLink = page.getByRole("link", { name: "Cleaner signup link" });
  await expect(joinLink).toHaveAttribute(
    "href",
    `${cleanerAppUrl}/join?code=${initialCode}`,
  );

  const members = page.getByRole("list", { name: "Active cleaner pool members" });
  await expect(members.getByRole("listitem")).toHaveCount(3);
  await expect(members).toContainText("Demo Cleaner One");
  await expect(members).toContainText("Joined 2 Aug 2026");
  await expect(members).toContainText("Demo Cleaner Two");
  await expect(members).toContainText("Joined 3 Aug 2026");
  await expect(members).toContainText("Demo Cleaner Three");
  await expect(members).toContainText("Joined 4 Aug 2026");
  await expect(members).not.toContainText("Demo Company Admin");
  await expect(members).not.toContainText("Demo Removed Cleaner");

  await page.getByRole("button", { name: "Copy cleaner signup link" }).click();
  await expect(page.getByRole("status")).toContainText("Cleaner signup link copied.");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${cleanerAppUrl}/join?code=${initialCode}`,
  );

  await page.getByRole("button", { name: "Copy invite message" }).click();
  await expect(page.getByRole("status")).toContainText("Invite message copied.");
  const copiedMessage = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedMessage).toBe(
    `Join Coastal Demo Cleaning's cleaner pool: ${cleanerAppUrl}/join?code=${initialCode}\nInvite code: ${initialCode}`,
  );

  await page.getByRole("button", { name: "Generate new code" }).click();
  await expect(code).not.toHaveText(initialCode);
  await expect(code).toHaveText(/^[A-Z0-9]{6}$/);
  const rotatedCode = (await code.textContent()) ?? "";
  await expect(joinLink).toHaveAttribute(
    "href",
    `${cleanerAppUrl}/join?code=${rotatedCode}`,
  );
  await page.reload();
  await expect(page.getByTestId("invite-code")).toHaveText(rotatedCode);
  await expect(
    page
      .getByRole("list", { name: "Active cleaner pool members" })
      .getByRole("listitem"),
  ).toHaveCount(3);
});
