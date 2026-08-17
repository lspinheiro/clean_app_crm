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

async function createClient(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: "Add client" }).click();
  const dialog = page.getByRole("dialog", { name: "Add client" });
  await dialog.getByLabel("Client name").fill(name);
  await dialog.getByLabel("Contact person").fill("Alex Morgan");
  await dialog.getByLabel("Phone").fill("07 5555 0123");
  await dialog.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function addSite(
  page: import("@playwright/test").Page,
  clientName: string,
  siteName: string,
  suburb: string,
) {
  const clientCard = page.getByRole("article", { name: clientName });
  await clientCard.getByRole("button", { name: `Add site to ${clientName}` }).click();
  const dialog = page.getByRole("dialog", { name: `Add site to ${clientName}` });
  await dialog.getByLabel("Site name").fill(siteName);
  await dialog.getByLabel("Street address").fill("10 Marine Parade");
  await dialog.getByLabel("Suburb").fill(suburb);
  await dialog.getByRole("button", { name: "Create site" }).click();
  await expect(clientCard.getByText(siteName, { exact: true })).toBeVisible();
}

test.describe("@CLE-7 clients and sites", () => {
  test("searches by client name and site name", async ({ page }) => {
    await signIn(page);
    await page.goto("/en-AU/clients");

    const search = page.getByRole("searchbox", { name: "Search clients and sites" });
    await search.fill("Oceanview");
    await expect(page.getByRole("heading", { name: "Oceanview Property Group" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Palm Grove Dental" })).toHaveCount(0);

    await search.fill("Southport Office");
    await expect(page.getByRole("heading", { name: "Oceanview Property Group" })).toBeVisible();
    await expect(page.getByText("Southport Office", { exact: true })).toBeVisible();
    await expect(page.getByText("Broadbeach Towers", { exact: true })).toHaveCount(0);
  });

  test("creates and reloads a multi-site client and a single-site client", async ({ page }) => {
    await signIn(page);
    await page.goto("/en-AU/clients");

    await createClient(page, "Harbour Offices");
    await addSite(page, "Harbour Offices", "Harbour North", "Southport");
    await addSite(page, "Harbour Offices", "Harbour Central", "Surfers Paradise");
    await addSite(page, "Harbour Offices", "Harbour South", "Broadbeach");
    await expect(
      page.getByRole("article", { name: "Harbour Offices" }).getByRole("listitem"),
    ).toHaveCount(3);

    await createClient(page, "Creekside Allied Health");
    await addSite(page, "Creekside Allied Health", "Creekside Clinic", "Robina");
    await expect(
      page.getByRole("article", { name: "Creekside Allied Health" }).getByRole("listitem"),
    ).toHaveCount(1);

    await page.reload();
    await expect(
      page.getByRole("article", { name: "Harbour Offices" }).getByRole("listitem"),
    ).toHaveCount(3);
    await expect(
      page.getByRole("article", { name: "Creekside Allied Health" }).getByRole("listitem"),
    ).toHaveCount(1);
  });
});
