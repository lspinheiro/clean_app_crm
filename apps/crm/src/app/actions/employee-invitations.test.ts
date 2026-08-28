import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@clean-app/db";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  inviteUserByEmail: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  revalidateLocalizedPath: vi.fn(),
  requireCompanyOwner: vi.fn(),
  rpc: vi.fn(),
  sendResendEmailBatches: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireCompanyOwner: mocks.requireCompanyOwner }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));
vi.mock("@/lib/resend", () => ({ sendResendEmailBatches: mocks.sendResendEmailBatches }));
vi.mock("@/i18n/revalidate", () => ({ revalidateLocalizedPath: mocks.revalidateLocalizedPath }));

import { initialEmployeeInvitationState } from "@/features/employee-invitations/state";
import {
  acceptEmployeeInvitationAction,
  inviteEmployeeAction,
  requestEmployeeInvitationLinkAction,
  revokeEmployeeInvitationAction,
} from "./employee-invitations";

const companyId = "10000000-0000-4000-8000-000000000010";
const invitationId = "83000000-0000-4000-8000-000000000101";
type EmployeeInvitationContext =
  Database["public"]["Functions"]["get_employee_invitation_context"]["Returns"][number];

function invitationForm(email = "new.employee@example.test") {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("locale", "en-AU");
  formData.set("role", "staff");
  return formData;
}

describe("CLE-83 employee invitation actions", () => {
  it("keeps the generated invitation profile locale nullable", () => {
    const profileLocale: EmployeeInvitationContext["profile_locale"] = null;

    expect(profileLocale).toBeNull();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CRM_APP_URL = "https://crm.example.test/path";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
    process.env.RESEND_API_KEY = "resend-secret";
    process.env.RESEND_FROM_EMAIL = "invites@example.test";
    process.env.SUPABASE_SECRET_KEY = "supabase-secret";
    mocks.requireCompanyOwner.mockResolvedValue({
      company: { id: companyId, name: "Coastal Demo Cleaning" },
      profile: { full_name: "Taylor Owner" },
      supabase: {
        auth: { updateUser: mocks.updateUser },
        rpc: mocks.rpc,
      },
      user: { email: "owner@example.test" },
    });
    mocks.cookies.mockResolvedValue({ set: mocks.cookieSet });
    mocks.createClient.mockResolvedValue({
      auth: { updateUser: mocks.updateUser },
      rpc: mocks.rpc,
    });
    mocks.createAdminClient.mockReturnValue({
      auth: {
        admin: { inviteUserByEmail: mocks.inviteUserByEmail },
        resetPasswordForEmail: mocks.resetPasswordForEmail,
      },
    });
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
    mocks.sendResendEmailBatches.mockResolvedValue([{
      providerMessageId: "message-1",
      recipientId: invitationId,
      status: "accepted",
    }]);
    mocks.updateUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CRM_APP_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("prepares the chosen role for the active company and sends a new account invitation", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        account_existed: false,
        auth_user_exists: false,
        invitation_expires_at: "2026-08-27T00:00:00.000Z",
        invitation_id: invitationId,
      }],
      error: null,
    });

    await expect(inviteEmployeeAction(invitationForm())).resolves.toEqual({ ok: true });

    expect(mocks.requireCompanyOwner).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "prepare_employee_invitation", {
      target_company_id: companyId,
      target_email: "new.employee@example.test",
      target_locale: "en-AU",
      target_role: "staff",
    });
    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith("new.employee@example.test", {
      data: {
        company_name: "Coastal Demo Cleaning",
        invitation_kind: "employee",
        preferred_locale: "en-AU",
      },
      // In the path, not a query: a redirect with no query cannot be joined with the wrong
      // separator, which is how an invitation reached an invitee as `site_url&token_hash=…`.
      redirectTo: `https://crm.example.test/en-AU/auth/confirm/${invitationId}`,
    });
    expect(mocks.sendResendEmailBatches).not.toHaveBeenCalled();
  });

  // The case that stranded a real invitee on 2026-08-28. Following an invite link confirms the
  // address — a scanner does it just as well as a person — while the password is only ever set
  // inside acceptance. Treating "confirmed" as "can sign in" sent "Sign in and accept the
  // invitation" to a login that does not exist, and `inviteUserByEmail` refuses an address that
  // is already registered, so neither existing branch could reach them.
  it("recovers an account that is registered but has no password", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        account_existed: false,
        auth_user_exists: true,
        invitation_expires_at: "2026-08-27T00:00:00.000Z",
        invitation_id: invitationId,
      }],
      error: null,
    });
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await expect(inviteEmployeeAction(invitationForm("confirmed.no.password@example.test")))
      .resolves.toEqual({ ok: true });

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "confirmed.no.password@example.test",
      { redirectTo: `https://crm.example.test/en-AU/auth/confirm/${invitationId}` },
    );
    // Re-inviting is refused for a registered address, and a sign-in link points at a password
    // nobody has ever chosen.
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.sendResendEmailBatches).not.toHaveBeenCalled();
    // The invitation stays open: recovery lands on the acceptance form, which now asks for a
    // password because `account_existed` is false.
    expect(mocks.rpc).not.toHaveBeenCalledWith("revoke_employee_invitation", expect.anything());
  });

  it("sends an existing account a sign-in link without creating another Auth user", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        account_existed: true,
        auth_user_exists: true,
        invitation_expires_at: "2026-08-27T00:00:00.000Z",
        invitation_id: invitationId,
      }],
      error: null,
    });

    await expect(inviteEmployeeAction(invitationForm("cleaner@example.test")))
      .resolves.toEqual({ ok: true });

    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.sendResendEmailBatches).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "resend-secret",
      batchId: invitationId,
      messages: [expect.objectContaining({
        recipientId: invitationId,
        to: "cleaner@example.test",
      })],
      replyTo: "owner@example.test",
    }));
  });

  it("revokes application state when invitation delivery fails", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          account_existed: false,
          auth_user_exists: false,
          invitation_expires_at: "2026-08-27T00:00:00.000Z",
          invitation_id: invitationId,
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: { message: "raw" } });

    await expect(inviteEmployeeAction(invitationForm())).resolves.toMatchObject({
      formError: "user.employeeInvitationDeliveryFailed",
      ok: false,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "revoke_employee_invitation", {
      target_company_id: companyId,
      target_invitation_id: invitationId,
    });
  });

  it("tells the owner to wait when the e-mail provider is rate limiting, and says why in the log", async () => {
    // Dotto's first invitation was revoked 46 ms after it was created on 2026-08-25 and
    // nothing recorded why. A bare `catch {}` made a rate limit, a bad address and a provider
    // outage the same event, so the owner was told to "check the address" for a problem that
    // had nothing to do with the address.
    const logged: unknown[][] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args) => {
      logged.push(args);
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          account_existed: false,
          auth_user_exists: false,
          invitation_expires_at: "2026-08-27T00:00:00.000Z",
          invitation_id: invitationId,
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { code: "over_email_send_rate_limit", message: "email rate limit exceeded", status: 429 },
    });

    await expect(inviteEmployeeAction(invitationForm())).resolves.toMatchObject({
      formError: "user.employeeInvitationRateLimited",
      ok: false,
    });
    expect(JSON.stringify(logged)).toMatch(/over_email_send_rate_limit/);

    consoleError.mockRestore();
  });

  it("keeps the provider's reason out of the owner's screen but not out of the log", async () => {
    const logged: unknown[][] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args) => {
      logged.push(args);
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          account_existed: false,
          auth_user_exists: false,
          invitation_expires_at: "2026-08-27T00:00:00.000Z",
          invitation_id: invitationId,
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: "mailbox unavailable for winston@example.test", status: 400 },
    });

    const result = await inviteEmployeeAction(invitationForm());

    expect(result).toMatchObject({ formError: "user.employeeInvitationDeliveryFailed", ok: false });
    // The reason has to survive somewhere, or the next unexplained revoke is unexplainable too.
    expect(JSON.stringify(logged)).toMatch(/mailbox unavailable/);
    expect(JSON.stringify(result)).not.toMatch(/mailbox unavailable/);

    consoleError.mockRestore();
  });

  it("rejects malformed input before resolving owner authority", async () => {
    await expect(inviteEmployeeAction(invitationForm("not-an-email"))).resolves.toMatchObject({
      fieldErrors: { email: expect.any(String) },
      ok: false,
    });
    expect(mocks.requireCompanyOwner).not.toHaveBeenCalled();
  });

  it("revokes only through the owner-authorised RPC and refreshes settings", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(revokeEmployeeInvitationAction(invitationId)).resolves.toEqual({ ok: true });

    expect(mocks.requireCompanyOwner).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_employee_invitation", {
      target_company_id: companyId,
      target_invitation_id: invitationId,
    });
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith("/settings");
  });

  it("accepts an existing account without replacing its password or identity", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          account_existed_at_invitation: true,
          invitation_status: "pending",
          locale: "en-AU",
          profile_full_name: "Ana Cleaner",
          profile_locale: "pt-BR",
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: companyId, error: null });
    const formData = new FormData();
    formData.set("invitationId", invitationId);

    await expect(acceptEmployeeInvitationAction(initialEmployeeInvitationState, formData))
      .rejects.toThrow("NEXT_REDIRECT:/pt-BR/roster");

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "accept_employee_invitation", {
      full_name: "Ana Cleaner",
      target_invitation_id: invitationId,
      target_locale: "pt-BR",
    });
  });

  it("sets up a new account before atomic employee acceptance", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          account_existed_at_invitation: false,
          invitation_status: "pending",
          locale: "en-AU",
          profile_full_name: "New cleaner",
          profile_locale: null,
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: companyId, error: null });
    const formData = new FormData();
    formData.set("confirmPassword", "safe-local-password");
    formData.set("fullName", "New Employee");
    formData.set("invitationId", invitationId);
    formData.set("locale", "en-AU");
    formData.set("password", "safe-local-password");

    await expect(acceptEmployeeInvitationAction(initialEmployeeInvitationState, formData))
      .rejects.toThrow("NEXT_REDIRECT:/en-AU/roster");

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "safe-local-password" });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "accept_employee_invitation", {
      full_name: "New Employee",
      target_invitation_id: invitationId,
      target_locale: "en-AU",
    });
  });
});

// The invitation record lives seven days; the token in the e-mail dies on the first GET. A
// scanner or a reload spends it, and `prepare_employee_invitation` refuses while an
// invitation is open, so before this the only recourse was revoke-and-reinvite by an admin.

describe("requesting a fresh invitation link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CRM_APP_URL = "https://crm.example.test/path";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
    process.env.SUPABASE_SECRET_KEY = "supabase-secret";
    // The invitee has no session, so the action reaches the database with the service role
    // rather than through requireCompanyOwner.
    mocks.createAdminClient.mockReturnValue({
      auth: {
        admin: { inviteUserByEmail: mocks.inviteUserByEmail },
        resetPasswordForEmail: mocks.resetPasswordForEmail,
      },
      rpc: mocks.rpc,
    });
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CRM_APP_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("re-sends the invitation that already exists rather than minting a new one", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        account_confirmed: false,
        claimed: true,
        invitee_email: "invitee@example.test",
        locale: "pt-BR",
      }],
      error: null,
    });
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await expect(requestEmployeeInvitationLinkAction(invitationId)).resolves.toEqual({ ok: true });

    expect(mocks.rpc).toHaveBeenCalledWith("claim_employee_invitation_link", {
      target_invitation_id: invitationId,
    });
    // Minting a new invitation would orphan the link already in the invitee's inbox.
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "prepare_employee_invitation",
      expect.anything(),
    );
    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith(
      "invitee@example.test",
      expect.objectContaining({
        data: expect.objectContaining({ invitation_kind: "employee" }),
      }),
    );
  });

  it("says the same thing whether or not the invitation could be re-sent", async () => {
    // A refusal that named its reason would tell whoever holds a link id which invitations
    // are live, and let them time the answers.
    mocks.rpc.mockResolvedValueOnce({
      data: [{ account_confirmed: null, claimed: false, invitee_email: null, locale: null }],
      error: null,
    });

    await expect(requestEmployeeInvitationLinkAction(invitationId)).resolves.toEqual({ ok: true });
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("refuses an identifier that is not an invitation before touching the database", async () => {
    await expect(requestEmployeeInvitationLinkAction("not-a-uuid")).resolves.toMatchObject({
      ok: false,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("recovers an account a scanner confirmed, which has no password anyone has seen", async () => {
    // The premise this replaces was wrong: a confirmed invitee cannot necessarily sign in.
    // Following an invite link confirms the address, and an e-mail scanner following it for
    // them does the same — but the password is only set later, inside acceptance. Treating
    // "confirmed" as "has a login" left exactly the person this feature exists for stranded.
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        account_confirmed: true,
        claimed: true,
        invitee_email: "invitee@example.test",
        locale: "en-AU",
      }],
      error: null,
    });
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await expect(requestEmployeeInvitationLinkAction(invitationId)).resolves.toEqual({ ok: true });

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "invitee@example.test",
      expect.objectContaining({
        redirectTo: `https://crm.example.test/en-AU/auth/confirm/${invitationId}`,
      }),
    );
    // `inviteUserByEmail` rejects an address that is already registered.
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("gives the minute back when the provider refuses the message", async () => {
    // Claiming reserves the minute before the provider has accepted anything. Without a
    // release, a rejected send tells the invitee a link is on the way and then blocks the
    // retry that would have worked.
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          account_confirmed: false,
          claimed: true,
          invitee_email: "invitee@example.test",
          locale: "en-AU",
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: "mailbox unavailable", status: 400 },
    });

    await expect(requestEmployeeInvitationLinkAction(invitationId)).resolves.toEqual({ ok: true });

    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "release_employee_invitation_link_claim", {
      target_invitation_id: invitationId,
    });
  });

  it("keeps the reservation when the message was accepted", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        account_confirmed: false,
        claimed: true,
        invitee_email: "invitee@example.test",
        locale: "en-AU",
      }],
      error: null,
    });
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await expect(requestEmployeeInvitationLinkAction(invitationId)).resolves.toEqual({ ok: true });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
