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

async function openOceanviewDetail(page: import("@playwright/test").Page) {
  await page.goto("/en-AU/clients");
  await page.getByRole("link", { name: "Oceanview Property Group" }).click();
  await expect(page).toHaveURL(/\/en-AU\/clients\/10000000-0000-4000-8000-000000000301$/);
}

test.describe("@CLE-8 client detail and site defaults", () => {
  test("shows canonical client/site data and the assignment-gating rule", async ({ page }) => {
    await signIn(page);
    await openOceanviewDetail(page);

    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Clients" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Oceanview Property Group" })).toBeVisible();
    await expect(page.getByText("Morgan Ellis · 07 5555 0101")).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Broadbeach Towers" })
        .getByText("Address and access notes are shown to a cleaner only after assignment"),
    ).toBeVisible();
    await expect(page.getByRole("group", { name: "Broadbeach Towers" })).toHaveAttribute("open", "");
    await expect(page.getByRole("group", { name: "Burleigh Retail" })).not.toHaveAttribute("open", "");
  });

  test("edits client data and persists site defaults into detail and list", async ({ page }) => {
    await signIn(page);
    await openOceanviewDetail(page);

    await page.getByRole("button", { name: "Edit client" }).click();
    const clientDialog = page.getByRole("dialog", { name: "Edit Oceanview Property Group" });
    await clientDialog.getByLabel("Contact person").fill("Morgan Ellis Updated");
    await clientDialog.getByRole("button", { name: "Save client" }).click();
    await expect(page.getByText("Morgan Ellis Updated · 07 5555 0101")).toBeVisible();

    const siteCard = page.getByRole("group", { name: "Broadbeach Towers" });
    await siteCard.getByRole("button", { name: "Edit Broadbeach Towers" }).click();
    const siteDialog = page.getByRole("dialog", { name: "Edit Broadbeach Towers" });
    await siteDialog.getByLabel("Street address").fill("12 Surf Parade");
    await siteDialog.getByLabel("Default service").selectOption({ label: "Office clean" });
    await siteDialog.getByLabel("Duration (hours)").fill("2.5");
    await siteDialog.getByLabel("Rate (AUD)").fill("165.50");
    await siteDialog.getByRole("button", { name: "Save site" }).click();

    await expect(siteCard.getByText("12 Surf Parade")).toBeVisible();
    await expect(
      siteCard.getByRole("definition").filter({ hasText: /^Office clean$/ }),
    ).toBeVisible();
    await expect(siteCard.getByText("2.5 h", { exact: true })).toBeVisible();
    await expect(siteCard.getByText("$165.50", { exact: true })).toBeVisible();

    await page.reload();
    await expect(
      page
        .getByRole("group", { name: "Broadbeach Towers" })
        .getByRole("definition")
        .filter({ hasText: /^Office clean$/ }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Clients" })
      .click();
    const clientCard = page.getByRole("article", { name: "Oceanview Property Group" });
    await expect(clientCard.getByText("Morgan Ellis Updated · 07 5555 0101")).toBeVisible();
    await expect(clientCard.getByText("Office clean · 2.5 h · $165.50")).toBeVisible();
  });
});
