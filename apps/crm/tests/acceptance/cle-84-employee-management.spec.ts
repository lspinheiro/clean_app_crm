import { expect, test } from "@playwright/test";

import {
  createAccounts,
  demoPassword,
  insertCompany,
  insertInvitations,
  insertMemberships,
  openSettings,
  removeAccounts,
  removeCompany,
  signIn,
} from "./support/invitations";

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
async function removeFixtureData() {
  // The company first: memberships and invitations cascade with it, and
  // `invited_by_profile_id` is `on delete restrict`.
  await removeCompany(companyId);
  await removeAccounts(fixtureAccounts.map((account) => account.email));
}

test.beforeAll(async () => {
  await removeFixtureData();
  const profileIds = await createAccounts(
    fixtureAccounts.map((account) => ({
      email: account.email,
      fullName: account.fullName,
      password: demoPassword,
    })),
  );

  await insertCompany({
    abn: "84111111111",
    id: companyId,
    name: "CLE-84 Demo Cleaning",
    status: "approved",
  });

  await insertMemberships(fixtureAccounts.map((account, index) => {
    const profileId = profileIds[index];
    if (!profileId) throw new Error(`Missing profile for ${account.email}`);
    return {
      company_id: companyId,
      joined_at: `2026-08-${String(index + 10).padStart(2, "0")}T00:00:00+10:00`,
      profile_id: profileId,
      role: account.role,
    };
  }));

  const inviterProfileId = profileIds[0];
  if (!inviterProfileId) throw new Error("Missing CLE-84 invitation owner");
  await insertInvitations([{
    account_existed_at_invitation: false,
    company_id: companyId,
    email: "invited.cle84@example.test",
    expires_at: "2099-08-20T00:00:00+10:00",
    invited_by_profile_id: inviterProfileId,
    locale: "en-AU",
    role: "staff",
  }]);
});

test.afterAll(removeFixtureData);

test.describe("@CLE-84 owner employee management", () => {
  test("an owner sees employees and invitations, changes a role, removes an employee and then themselves", async ({
    page,
  }) => {
    await signIn(page, "owner.one.cle84@clean-app.example.test");
    await openSettings(page);

    const employees = page.getByRole("region", { name: "Company access" });
    await expect(employees.getByText("CLE-84 Owner One", { exact: true })).toBeVisible();
    await expect(employees.getByText("owner.one.cle84@clean-app.example.test")).toBeVisible();
    await expect(employees.getByText("Joined 10 Aug 2026", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Invite an employee" })).toBeVisible();
    await expect(page.getByText("invited.cle84@example.test", { exact: true })).toBeVisible();

    const staffRow = employees.getByRole("group", { name: "CLE-84 Staff" });
    await staffRow.getByRole("combobox", { name: "Company access for CLE-84 Staff" })
      .selectOption("owner");
    await staffRow.getByRole("button", { name: "Save company access for CLE-84 Staff" }).click();
    const promoteDialog = page.getByRole("dialog", { name: "Give CLE-84 Staff owner access?" });
    await promoteDialog.getByRole("button", { name: "Give owner access" }).click();
    await expect(staffRow.getByRole("status")).toHaveText(
      "CLE-84 Staff now has Owner access.",
    );
    await expect(staffRow.getByRole("combobox", { name: "Company access for CLE-84 Staff" }))
      .toHaveValue("owner");

    await staffRow.getByRole("button", { name: "Remove company access for CLE-84 Staff" }).click();
    const staffRemoveDialog = page.getByRole("dialog", {
      name: "Remove CLE-84 Staff’s company access?",
    });
    await staffRemoveDialog.getByRole("button", { name: "Remove access" }).click();
    await expect(employees.getByText("CLE-84 Staff", { exact: true })).toHaveCount(0);
    await expect(employees.getByRole("status")).toHaveText(
      "CLE-84 Staff’s company access was removed.",
    );

    const selfRow = employees.getByRole("group", { name: "CLE-84 Owner One" });
    await selfRow.getByRole("button", {
      name: "Remove company access for CLE-84 Owner One",
    }).click();
    const selfRemoveDialog = page.getByRole("dialog", { name: "Remove your company access?" });
    await selfRemoveDialog.getByRole("button", { name: "Remove my access" }).click();
    await expect(page).toHaveURL(/\/en-AU\/no-company-access$/);
    await expect(page.getByRole("heading", { name: "No company access" })).toBeVisible();
  });

  test("the remaining owner sees zero-owner changes protected before submission", async ({ page }) => {
    await signIn(page, "owner.two.cle84@clean-app.example.test");
    await openSettings(page);

    const employees = page.getByRole("region", { name: "Company access" });
    const selfRow = employees.getByRole("group", { name: "CLE-84 Owner Two" });
    await expect(selfRow.getByText(
      "Assign another owner before changing or removing this access.",
    )).toBeVisible();
    await selfRow.getByRole("combobox", { name: "Company access for CLE-84 Owner Two" })
      .selectOption("staff");
    await expect(selfRow.getByRole("button", {
      name: "Save company access for CLE-84 Owner Two",
    })).toBeDisabled();
    await expect(selfRow.getByRole("button", {
      name: "Remove company access for CLE-84 Owner Two",
    })).toBeDisabled();
    await expect(page).toHaveURL(/\/en-AU\/settings$/);
  });
});
