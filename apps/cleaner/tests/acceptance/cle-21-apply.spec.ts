import { expect, test, type Page } from "@playwright/test";

// Runs against the seeded local database (`pnpm db:reset`), which the e2e launcher resets
// before the run. This spec mutates state — it leaves one withdrawn application behind —
// so it is deliberately the last one alphabetically and touches only Palm Grove Practice,
// the crew-of-one site that CLE-20's assertions never count.
const cleanerEmail = "cleaner.two@clean-app.example.test";
const demoPassword = "local-demo-only";
const site = "Palm Grove Practice";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(cleanerEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/board$/);
}

function openCards(page: Page) {
  return page.getByRole("list", { name: "Open jobs" }).getByRole("listitem");
}

function appliedCards(page: Page) {
  return page.getByRole("list", { name: "Applied" }).getByRole("listitem");
}

test.describe("@CLE-21 applying and withdrawing", () => {
  test("apply waits, survives a reload, and withdrawing shuts the card honestly", async ({
    page,
  }) => {
    await signIn(page);
    await expect(openCards(page).first()).toBeVisible();

    // The seed already carries applications, so this test never assumes an empty Applied
    // list — it follows one card it picks itself. That card must be genuinely open: a
    // withdrawn or lost one also sits in the open list, with Apply shut.
    const target = openCards(page)
      .filter({ hasText: site })
      .filter({ hasNotText: "You withdrew from this job." })
      .filter({ hasNotText: "This job went to someone else." })
      .first();
    await expect(target).toBeVisible();
    await expect(target.getByRole("button", { name: "Apply" })).toBeEnabled();
    // Pin the exact instance by its date-and-time line, so the assertions below follow
    // this card rather than any other generated instance of the same site.
    const when = (await target.locator(".vacancy-card__when").innerText()).trim();

    await target.getByRole("button", { name: "Apply" }).click();

    // One tap moves it into Applied with a visible waiting state.
    const waiting = appliedCards(page).filter({ hasText: when });
    await expect(waiting).toHaveCount(1);
    await expect(waiting).toContainText("Waiting to hear back");
    await expect(waiting.getByRole("button", { name: "Withdraw" })).toBeEnabled();
    // It is no longer offered as open work.
    await expect(openCards(page).filter({ hasText: when })).toHaveCount(0);

    // The waiting state is the database's, not this component's.
    await page.reload();
    const afterReload = appliedCards(page).filter({ hasText: when });
    await expect(afterReload).toContainText("Waiting to hear back");

    await afterReload.getByRole("button", { name: "Withdraw" }).click();

    // The card returns to the open list, but the database refuses a second application, so
    // Apply is shut and says why instead of failing on tap.
    await expect(appliedCards(page).filter({ hasText: when })).toHaveCount(0);
    const withdrawn = openCards(page).filter({ hasText: when });
    await expect(withdrawn).toHaveCount(1);
    await expect(withdrawn).toContainText("You withdrew from this job.");
    await expect(withdrawn.getByRole("button", { name: "Apply" })).toBeDisabled();

    // And that is durable too.
    await page.reload();
    const stillWithdrawn = openCards(page).filter({ hasText: when });
    await expect(stillWithdrawn).toContainText("You withdrew from this job.");
    await expect(stillWithdrawn.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  test("never reveals the address or client contact once she has applied", async ({ page }) => {
    await signIn(page);
    await expect(openCards(page).first()).toBeVisible();

    // Applying is not assignment, so the gate that CLE-20 proved must still hold.
    const rendered = await page.locator("body").innerText();
    for (const secret of ["10 Surf Parade", "45 Nerang Street", "Demo access notes", "07 5555 0101"]) {
      expect(rendered).not.toContain(secret);
    }
  });
});
