import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@clean-app/db";

const demoPassword = "local-demo-only";
const companyId = "84000000-0000-4000-8000-000000000030";
const fixtureAccounts = [
  {
    email: "owner.one.cle84@clean-app.example.test",
    fullName: "CLE-84 Owner One",
    role: "owner" as const,
  },
  {
    email: "owner.two.cle84@clean-app.example.test",
    fullName: "CLE-84 Owner Two",
    role: "owner" as const,
  },
  {
    email: "staff.cle84@clean-app.example.test",
    fullName: "CLE-84 Staff",
    role: "staff" as const,
  },
];
const localEnvironment = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
}).parse(process.env);
const admin = createClient<Database>(
  localEnvironment.NEXT_PUBLIC_SUPABASE_URL,
  localEnvironment.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function removeFixtureData() {
  const { error: companyError } = await admin
    .from("companies")
    .delete()
    .eq("id", companyId);
  if (companyError) throw companyError;

  const { data, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1_000,
  });
  if (listError) throw listError;
  const fixtureEmails = new Set(fixtureAccounts.map((account) => account.email));
  for (const user of data.users) {
    if (!user.email || !fixtureEmails.has(user.email)) continue;
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
  }
}

test.beforeAll(async () => {
  await removeFixtureData();
  const profileIds: string[] = [];
  for (const account of fixtureAccounts) {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      email_confirm: true,
      password: demoPassword,
      user_metadata: { full_name: account.fullName },
    });
    if (error) throw error;
    if (!data.user) throw new Error(`Could not create ${account.email}`);
    profileIds.push(data.user.id);
  }

  const { error: companyError } = await admin.from("companies").insert({
    abn: "84111111111",
    id: companyId,
    name: "CLE-84 Demo Cleaning",
    status: "approved",
  });
  if (companyError) throw companyError;

  const memberships = fixtureAccounts.map((account, index) => {
    const profileId = profileIds[index];
    if (!profileId) throw new Error(`Missing profile for ${account.email}`);
    return {
      company_id: companyId,
      joined_at: `2026-08-${String(index + 10).padStart(2, "0")}T00:00:00+10:00`,
      profile_id: profileId,
      role: account.role,
    };
  });
  const { error: membershipError } = await admin.from("employee_memberships").insert(memberships);
  if (membershipError) throw membershipError;

  const inviterProfileId = profileIds[0];
  if (!inviterProfileId) throw new Error("Missing CLE-84 invitation owner");
  const { error: invitationError } = await admin.from("employee_invitations").insert({
    account_existed_at_invitation: false,
    company_id: companyId,
    email: "invited.cle84@example.test",
    expires_at: "2099-08-20T00:00:00+10:00",
    invited_by_profile_id: inviterProfileId,
    locale: "en-AU",
    role: "staff",
  });
  if (invitationError) throw invitationError;
});

test.afterAll(removeFixtureData);

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function openSettings(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: "Company settings" }).click();
  await expect(page).toHaveURL(/\/en-AU\/settings$/);
}

test.describe("@CLE-84 owner employee management", () => {
  test("an owner sees employees and invitations, changes a role, removes an employee and then themselves", async ({
    page,
  }) => {
    await signIn(page, "owner.one.cle84@clean-app.example.test");
    await openSettings(page);

    const employees = page.getByRole("region", { name: "Employees" });
    await expect(employees.getByText("CLE-84 Owner One", { exact: true })).toBeVisible();
    await expect(employees.getByText("owner.one.cle84@clean-app.example.test")).toBeVisible();
    await expect(employees.getByText("Joined 10 Aug 2026", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Invite an employee" })).toBeVisible();
    await expect(page.getByText("invited.cle84@example.test", { exact: true })).toBeVisible();

    const staffRow = employees.getByRole("group", { name: "CLE-84 Staff" });
    await staffRow.getByRole("combobox", { name: "Role for CLE-84 Staff" })
      .selectOption("owner");
    await staffRow.getByRole("button", { name: "Save role for CLE-84 Staff" }).click();
    await expect(page.getByRole("status")).toHaveText("Employee role updated.");
    await expect(staffRow.getByRole("combobox", { name: "Role for CLE-84 Staff" }))
      .toHaveValue("owner");

    await staffRow.getByRole("button", { name: "Remove CLE-84 Staff" }).click();
    await expect(page.getByRole("status")).toHaveText("Employee removed.");
    await expect(employees.getByText("CLE-84 Staff", { exact: true })).toHaveCount(0);

    const selfRow = employees.getByRole("group", { name: "CLE-84 Owner One" });
    await selfRow.getByRole("button", { name: "Remove CLE-84 Owner One" }).click();
    await expect(page).toHaveURL(/\/en-AU\/no-company-access$/);
    await expect(page.getByRole("heading", { name: "No company access" })).toBeVisible();
  });

  test("the remaining owner gets a clear refusal for both zero-owner outcomes", async ({ page }) => {
    await signIn(page, "owner.two.cle84@clean-app.example.test");
    await openSettings(page);

    const employees = page.getByRole("region", { name: "Employees" });
    const selfRow = employees.getByRole("group", { name: "CLE-84 Owner Two" });
    await selfRow.getByRole("combobox", { name: "Role for CLE-84 Owner Two" })
      .selectOption("staff");
    await selfRow.getByRole("button", { name: "Save role for CLE-84 Owner Two" }).click();
    await expect(employees.getByRole("alert")).toHaveText(
      "This company must keep at least one owner.",
    );

    await selfRow.getByRole("button", { name: "Remove CLE-84 Owner Two" }).click();
    await expect(employees.getByRole("alert")).toHaveText(
      "This company must keep at least one owner.",
    );
    await expect(page).toHaveURL(/\/en-AU\/settings$/);
  });
});
