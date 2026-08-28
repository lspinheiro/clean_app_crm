import { expect, test } from "@playwright/test";

import {
  adminClient,
  createAccounts,
  demoPassword,
  insertCompany,
  insertInvitations,
  insertMemberships,
  openSettings,
  removeAccounts,
  removeCompany,
  signIn,
  signOut,
} from "./support/invitations";

/**
 * CLE-106. Four branches of the invitation journey were only ever exercised by unit tests
 * against mocked RPCs: the owner's send form, arriving signed in as somebody else, asking for
 * a fresh link, and the recovery e-mail that is the only way in for an address Auth has
 * confirmed but which holds no password. Each is driven here against the real database and the
 * real Auth service, on a company of its own so nothing collides with the seeded fixture the
 * CLE-83 and CLE-84 suites assert against.
 */
const companyId = "10600000-0000-4000-8000-000000000030";
const companyName = "CLE-106 Demo Cleaning";

const ownerEmail = "owner.cle106@clean-app.example.test";
const bystanderEmail = "bystander.cle106@clean-app.example.test";
/** Confirmed and holding no password — the state the recovery branch exists for. */
const passwordlessEmail = "passwordless.cle106@example.test";
/** Never registered; the owner's send form and the re-send both create their Auth record. */
const sentEmail = "sent.cle106@example.test";
const newLinkEmail = "newlink.cle106@example.test";
const wrongAccountEmail = "wrong.account.cle106@example.test";

const wrongAccountInvitationId = "10600000-0000-4000-8000-000000000201";
const newLinkInvitationId = "10600000-0000-4000-8000-000000000202";
const passwordlessInvitationId = "10600000-0000-4000-8000-000000000203";

/** Chosen inside acceptance, so it cannot be the demo password every seeded account shares. */
const recoveredPassword = "cle106-recovered-password";

const fixtureEmails = [
  bystanderEmail,
  newLinkEmail,
  ownerEmail,
  passwordlessEmail,
  sentEmail,
  wrongAccountEmail,
];

async function removeFixtureData() {
  // The company first: invitations cascade with it, and `invited_by_profile_id` is
  // `on delete restrict`, so the owner cannot go while an invitation still names them.
  await removeCompany(companyId);
  await removeAccounts(fixtureEmails);
}

test.beforeAll(async () => {
  await removeFixtureData();
  const [ownerProfileId] = await createAccounts([
    { email: ownerEmail, fullName: "CLE-106 Owner", password: demoPassword },
    { email: bystanderEmail, fullName: "CLE-106 Bystander", password: demoPassword },
    // No password: created by invitation and confirmed without ever finishing acceptance.
    { email: passwordlessEmail, fullName: "CLE-106 Passwordless" },
  ]);
  if (!ownerProfileId) throw new Error("Missing CLE-106 owner");

  await insertCompany({
    abn: "10611111111",
    id: companyId,
    name: companyName,
    status: "approved",
  });
  await insertMemberships([{
    company_id: companyId,
    joined_at: "2026-08-10T00:00:00+10:00",
    profile_id: ownerProfileId,
    role: "owner",
  }]);
  await insertInvitations([
    {
      account_existed_at_invitation: false,
      company_id: companyId,
      email: wrongAccountEmail,
      expires_at: "2099-08-20T00:00:00+10:00",
      id: wrongAccountInvitationId,
      invited_by_profile_id: ownerProfileId,
      locale: "en-AU",
      role: "staff",
    },
    {
      account_existed_at_invitation: false,
      company_id: companyId,
      email: newLinkEmail,
      expires_at: "2099-08-20T00:00:00+10:00",
      id: newLinkInvitationId,
      invited_by_profile_id: ownerProfileId,
      locale: "en-AU",
      role: "staff",
    },
    {
      // False is the honest reading for this address: Auth has confirmed it and it holds no
      // password, so acceptance still has to ask for one.
      account_existed_at_invitation: false,
      company_id: companyId,
      email: passwordlessEmail,
      expires_at: "2099-08-20T00:00:00+10:00",
      id: passwordlessInvitationId,
      invited_by_profile_id: ownerProfileId,
      locale: "en-AU",
      role: "staff",
    },
  ]);
});

test.afterAll(removeFixtureData);

test.describe("@CLE-106 employee invitation journeys", () => {
  test("an owner sends an invitation from the form and sees it listed as pending", async ({
    page,
  }) => {
    await signIn(page, ownerEmail);
    await expect(page).toHaveURL(/\/en-AU\/roster$/);
    await openSettings(page);

    const invitations = page.getByRole("region", { name: "Invite an employee" });
    await invitations.getByLabel("Email").fill(sentEmail);
    await invitations.getByRole("combobox", { name: "Company access", exact: true })
      .selectOption("owner");
    await invitations.getByRole("button", { name: "Send invitation" }).click();

    // Owner access hands over the whole company and the e-mail cannot be recalled, so the
    // send is held at a confirmation rather than leaving on the first click.
    const confirmation = page.getByRole("dialog", {
      name: `Invite ${sentEmail} as an owner?`,
    });
    await confirmation.getByRole("button", { name: "Send owner invitation" }).click();

    const list = page.getByLabel("Employee invitations");
    const row = list.locator("article", { hasText: sentEmail });
    await expect(row.getByText("Pending", { exact: true })).toBeVisible();
    // The row states the access granted alongside the date it was offered, in one line.
    await expect(row).toContainText("Owner ·");
    // Delivery is what decides between this and a revoked invitation with a form error, so a
    // pending row is also the proof that the e-mail left. The form clears only on success.
    await expect(invitations.getByLabel("Email")).toHaveValue("");
    // Scoped to the section: Next's own route announcer is a `role="alert"` on every page, so
    // asking the whole page for one can only ever find it. The send's failure message lives
    // here, beside the form it belongs to.
    await expect(invitations.getByRole("alert")).toHaveCount(0);
  });

  test("an invitation opened by the wrong account names both and offers a way out", async ({
    page,
  }) => {
    await signIn(page, bystanderEmail);
    await expect(page).toHaveURL(/\/en-AU\/no-company-access$/);

    await page.goto(`/en-AU/invite/accept?employeeInvitation=${wrongAccountInvitationId}`);

    // `get_employee_invitation_context` answers with nothing for a session that is not the
    // invitee's, exactly as it does for revoked and expired. The masked hint from the preview
    // is what lets this state name itself instead of joining that pile.
    await expect(page.getByRole("heading", { name: "You're signed in as a different account" }))
      .toBeVisible();
    await expect(page.getByText(
      `This invitation is for w***@example.test. You're signed in as ${bystanderEmail}.`,
    )).toBeVisible();

    await page.getByRole("button", { name: "Use another account" }).click();

    // Signing out happens in place, keeping the invitation in the address bar: landing on the
    // sign-in page would drop the invitation this visitor is holding.
    await expect(page.getByRole("heading", { name: "Open your invitation" })).toBeVisible();
    await expect(page).toHaveURL(
      `/en-AU/invite/accept?employeeInvitation=${wrongAccountInvitationId}`,
    );
    await expect(page.getByRole("button", { name: "Send me a new link" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("an invitee whose link was spent sends themselves a new one", async ({ page }) => {
    await page.goto(`/en-AU/invite/accept?employeeInvitation=${newLinkInvitationId}`);
    await expect(page.getByRole("heading", { name: "Open your invitation" })).toBeVisible();

    await page.getByRole("button", { name: "Send me a new link" }).click();

    await expect(page.getByRole("status")).toHaveText(
      "Check your inbox. If this invitation is still open, a new link is on its way to n***@example.test.",
    );

    // The answer is the same whether or not anything was sent, so that holding a link id
    // cannot be used to discover which invitations are live. What separates a real send from
    // that neutral answer is the claim it had to take first.
    const { data, error } = await adminClient()
      .from("employee_invitations")
      .select("last_link_sent_at")
      .eq("id", newLinkInvitationId)
      .single();
    if (error) throw error;
    expect(data.last_link_sent_at).not.toBeNull();
  });

  test("a confirmed address with no password is let in by recovery and can sign in after", async ({
    page,
  }) => {
    // What `resetPasswordForEmail` puts in the invitee's inbox. Minted here so the journey
    // does not depend on reading the local mailbox.
    const { data, error } = await adminClient().auth.admin.generateLink({
      email: passwordlessEmail,
      type: "recovery",
    });
    if (error) throw error;

    await page.goto(
      `/en-AU/auth/confirm/${passwordlessInvitationId}`
        + `?token_hash=${data.properties.hashed_token}&type=recovery`,
    );

    // The route parks the token rather than spending it, so the address bar keeps no token and
    // pressing Continue is the one step a person takes.
    await expect(page).toHaveURL(
      `/en-AU/invite/accept?employeeInvitation=${passwordlessInvitationId}`,
    );
    await expect(page.getByRole("heading", { name: "Continue to your invitation" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: `Join ${companyName}` })).toBeVisible();
    // Asked for because the address holds no password. Skipping it here is the CLE-94 lockout:
    // a member who can use this one session and nothing after it.
    await page.getByRole("textbox", { name: "Full name" }).fill("CLE-106 Recovered Employee");
    await page.getByRole("combobox", { name: "Language" }).selectOption("en-AU");
    await page.getByLabel("Password", { exact: true }).fill(recoveredPassword);
    await page.getByLabel("Confirm password").fill(recoveredPassword);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page).toHaveURL(/\/en-AU\/roster$/);

    await signOut(page);
    await signIn(page, passwordlessEmail, recoveredPassword);
    await expect(page).toHaveURL(/\/en-AU\/roster$/);
  });
});
