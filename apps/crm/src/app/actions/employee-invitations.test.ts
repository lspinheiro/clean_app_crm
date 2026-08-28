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
  updateUserById: vi.fn(),
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
import { localiseUserMessage } from "@/i18n/user-message";
import {
  acceptEmployeeInvitationAction,
  inviteEmployeeAction,
  requestEmployeeInvitationLinkAction,
  revokeEmployeeInvitationAction,
} from "./employee-invitations";

const companyId = "10000000-0000-4000-8000-000000000010";
const invitationId = "83000000-0000-4000-8000-000000000101";
const inviteeUserId = "83000000-0000-4000-8000-000000000201";
type EmployeeInvitationContext =
  Database["public"]["Functions"]["get_employee_invitation_context"]["Returns"][number];

/**
 * CLE-100. What the e-mail needs and the invitee's session cannot supply: the re-send runs
 * without one, so the company and the person who invited them come from the invitation row.
 */
function deliveryDetails(overrides: Record<string, unknown> = {}) {
  return {
    data: [{
      company_name: "Coastal Demo Cleaning",
      invitee_user_id: inviteeUserId,
      inviter_name: "Taylor Owner",
      ...overrides,
    }],
    error: null,
  };
}

function invitationForm(email = "new.employee@example.test") {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("locale", "en-AU");
  formData.set("role", "staff");
  return formData;
}

/** What the acceptance form posts for an invitee who still has to choose a password. */
function acceptanceForm(password = "safe-local-password") {
  const formData = new FormData();
  formData.set("confirmPassword", password);
  formData.set("fullName", "New Employee");
  formData.set("invitationId", invitationId);
  formData.set("locale", "en-AU");
  formData.set("password", password);
  return formData;
}

function newAccountContext(invitationStatus = "pending") {
  return {
    account_existed_at_invitation: false,
    invitation_status: invitationStatus,
    locale: "en-AU",
    profile_full_name: "New cleaner",
    profile_locale: null,
  };
}

describe("CLE-83 employee invitation actions", () => {
  it("keeps the generated invitation profile locale nullable", () => {
    const profileLocale: EmployeeInvitationContext["profile_locale"] = null;

    expect(profileLocale).toBeNull();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // `clearAllMocks` empties the call log but not the `mockResolvedValueOnce` queue, so a run
    // that stops early leaves its unconsumed answers for whatever test comes next.
    mocks.rpc.mockReset();
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
        admin: {
          inviteUserByEmail: mocks.inviteUserByEmail,
          updateUserById: mocks.updateUserById,
        },
        resetPasswordForEmail: mocks.resetPasswordForEmail,
      },
      rpc: mocks.rpc,
    });
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
    mocks.updateUserById.mockResolvedValue({ data: { user: { id: inviteeUserId } }, error: null });
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
        // CLE-100. The template renders whoever this names; without it the invitation arrives
        // from a company the invitee may not recognise and from nobody in particular.
        inviter_name: "Taylor Owner",
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
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          account_existed: false,
          auth_user_exists: true,
          invitation_expires_at: "2026-08-27T00:00:00.000Z",
          invitation_id: invitationId,
        }],
        error: null,
      })
      .mockResolvedValueOnce(deliveryDetails());
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await expect(inviteEmployeeAction(invitationForm("confirmed.no.password@example.test")))
      .resolves.toEqual({ ok: true });

    // CLE-100. A recovery e-mail carries no payload of its own — `resetPasswordForEmail` takes
    // a redirect and nothing else, and the template reads the account's own metadata — so the
    // two facts the invitee needs are written onto the account before the send is asked for.
    expect(mocks.updateUserById).toHaveBeenCalledWith(inviteeUserId, {
      user_metadata: {
        company_name: "Coastal Demo Cleaning",
        invitation_kind: "employee",
        inviter_name: "Taylor Owner",
        preferred_locale: "en-AU",
      },
    });
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

  // Naming the sender is worth a round trip, not the invitation. If the account cannot be
  // described the recovery e-mail is still the only way this person gets in, so it goes.
  it("still recovers the account when the invitation could not be described", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          account_existed: false,
          auth_user_exists: true,
          invitation_expires_at: "2026-08-27T00:00:00.000Z",
          invitation_id: invitationId,
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "details unavailable" } });
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await expect(inviteEmployeeAction(invitationForm("confirmed.no.password@example.test")))
      .resolves.toEqual({ ok: true });

    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalledWith("revoke_employee_invitation", expect.anything());

    consoleError.mockRestore();
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

  // CLE-100. The company was named and the person was not. In an inbox the sender is the
  // strongest signal there is: an invitee who does not recognise a trading name recognises the
  // owner who told them an invitation was coming — and the subject line is the only place the
  // e-mail gets to say so before it is opened.
  it.each(["en-AU", "pt-BR"] as const)(
    "names the inviter and the company throughout the %s sign-in e-mail",
    async (locale) => {
      mocks.rpc.mockResolvedValueOnce({
        data: [{
          account_existed: true,
          auth_user_exists: true,
          invitation_expires_at: "2026-08-27T00:00:00.000Z",
          invitation_id: invitationId,
        }],
        error: null,
      });
      const formData = invitationForm("cleaner@example.test");
      formData.set("locale", locale);

      await expect(inviteEmployeeAction(formData)).resolves.toEqual({ ok: true });

      const [batch] = mocks.sendResendEmailBatches.mock.calls[0] as [{
        messages: { html: string; subject: string; text: string }[];
      }];
      const [message] = batch.messages;
      for (const [part, body] of Object.entries(message)) {
        if (part === "recipientId" || part === "to") continue;
        expect(body, `${part} in ${locale}`).toContain("Taylor Owner");
        expect(body, `${part} in ${locale}`).toContain("Coastal Demo Cleaning");
      }
    },
  );

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
    // The owner is looking at a list drawn before the invitation existed. Without this the
    // withdrawal is real but invisible, and the same address cannot be invited again.
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith("/settings");
  });

  // CLE-95. The withdrawal is the only thing keeping a rejected send from leaving an invitation
  // nobody can see: it is pending in the database, absent from the list the owner is looking at,
  // and it blocks the next invitation to that address. When the withdrawal itself fails, saying
  // "check the address and try again" sends the owner into exactly that wall.
  it("tells the owner the invitation is still open when the withdrawal also fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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
      .mockResolvedValueOnce({ data: null, error: { message: "revoke rejected" } });
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: { message: "raw" } });

    await expect(inviteEmployeeAction(invitationForm())).resolves.toMatchObject({
      formError: "user.employeeInvitationDeliveryFailedStillOpen",
      ok: false,
    });
    // The list has to come back, or the message names a row the owner cannot see or revoke.
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith("/settings");

    consoleError.mockRestore();
  });

  it("keeps the rate-limit reason while saying the invitation is still open", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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
      .mockRejectedValueOnce(new Error("revoke threw"));
    mocks.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { code: "over_email_send_rate_limit", message: "email rate limit exceeded", status: 429 },
    });

    await expect(inviteEmployeeAction(invitationForm())).resolves.toMatchObject({
      formError: "user.employeeInvitationRateLimitedStillOpen",
      ok: false,
    });

    consoleError.mockRestore();
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

  // CLE-99. The language error was collected and had no sentence of its own, so it localised
  // to the generic fallback — next to a field the form never marked. Nothing was saved and
  // nothing said why.
  it("names the language field when the posted language is not one we ship", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [newAccountContext()], error: null });
    const formData = acceptanceForm();
    formData.set("locale", "de-DE");

    const result = await acceptEmployeeInvitationAction(initialEmployeeInvitationState, formData);

    expect(result).toMatchObject({
      fieldErrors: { locale: "user.supportedLanguageRequired" },
      ok: false,
    });
    // Read before anything is written: a refused language must not cost a password change.
    expect(mocks.updateUser).not.toHaveBeenCalled();
    for (const locale of ["en-AU", "pt-BR"] as const) {
      const localised = localiseUserMessage("user.supportedLanguageRequired", locale);
      expect(localised?.trim(), `supportedLanguageRequired in ${locale}`).toBeTruthy();
      expect(localised, `supportedLanguageRequired in ${locale}`)
        .not.toBe(localiseUserMessage("user.notAKey", locale));
    }
  });
});

// CLE-96. Acceptance is two steps that cannot be made one: the password is saved through Auth,
// the membership through a Postgres RPC. When the second step failed the first had already
// happened, and the answer named neither fact — so the invitee was left holding a password they
// were not told about, outside a company they had not joined.
describe("retrying employee acceptance after a failure", () => {
  // `clearAllMocks` empties the call log but not the `mockResolvedValueOnce` queue, so a run
  // that stops early leaves its unconsumed answers for whatever test comes next. Draining both
  // ends keeps a red test here from failing tests elsewhere in the file.
  function drainQueuedAnswers() {
    mocks.rpc.mockReset();
    mocks.updateUser.mockReset();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    drainQueuedAnswers();
    mocks.cookies.mockResolvedValue({ set: mocks.cookieSet });
    mocks.createClient.mockResolvedValue({
      auth: { updateUser: mocks.updateUser },
      rpc: mocks.rpc,
    });
    mocks.updateUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  afterEach(drainQueuedAnswers);

  // The retry that had nowhere to go. The first attempt saved the password, so re-submitting the
  // same one is refused by GoTrue as `same_password` — which reached the invitee as "choose
  // another password", advice to abandon the password that had in fact been saved. GoTrue only
  // reaches that check when a password is already stored, so the refusal is the confirmation
  // that this step is already done, and the membership CLE-94 forbids creating without one is
  // safe to create.
  it("completes acceptance when the retry re-submits the password already saved", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [newAccountContext()], error: null })
      .mockResolvedValueOnce({ data: companyId, error: null });
    mocks.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: {
        code: "same_password",
        message: "New password should be different from the old password.",
        status: 422,
      },
    });

    await expect(acceptEmployeeInvitationAction(initialEmployeeInvitationState, acceptanceForm()))
      .rejects.toThrow("NEXT_REDIRECT:/en-AU/roster");

    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "accept_employee_invitation", {
      full_name: "New Employee",
      target_invitation_id: invitationId,
      target_locale: "en-AU",
    });
  });

  // A password that Auth genuinely refuses must still stop the flow dead. Creating the membership
  // here is the CLE-94 lockout: a member who can use this one session and nothing after it.
  it("never creates the membership when the password itself was rejected", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [newAccountContext()], error: null });
    mocks.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "weak_password", message: "Password is too weak", status: 422 },
    });

    await expect(acceptEmployeeInvitationAction(initialEmployeeInvitationState, acceptanceForm()))
      .resolves.toMatchObject({
        fieldErrors: { password: "user.employeeInvitationPasswordRejected" },
        ok: false,
      });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("says the password was saved when the membership step fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc
      .mockResolvedValueOnce({ data: [newAccountContext()], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "deadlock detected" } });

    const result = await acceptEmployeeInvitationAction(
      initialEmployeeInvitationState,
      acceptanceForm(),
    );

    // "No longer available" was false — the invitation is open, and pressing accept again is the
    // whole of what is left to do.
    expect(result).toMatchObject({
      formError: "user.employeeInvitationPasswordSaved",
      ok: false,
    });

    consoleError.mockRestore();
  });

  it("asks an existing account to accept again when the membership step fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          account_existed_at_invitation: true,
          invitation_status: "pending",
          locale: "en-AU",
          profile_full_name: "Ana Cleaner",
          profile_locale: "en-AU",
        }],
        error: null,
      })
      .mockRejectedValueOnce(new Error("connection reset"));
    const formData = new FormData();
    formData.set("invitationId", invitationId);

    await expect(acceptEmployeeInvitationAction(initialEmployeeInvitationState, formData))
      .resolves.toMatchObject({
        formError: "user.employeeInvitationNotCompleted",
        ok: false,
      });
    // Nothing was changed on the way to failing, so the message must not claim otherwise.
    expect(mocks.updateUser).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  // The form is drawn from a reading taken when the page loaded. Everything below can happen
  // between that reading and the submit, and every one of them arrived as the same sentence.
  it.each([
    ["expired", "user.employeeInvitationExpired"],
    ["replaced", "user.employeeInvitationReplaced"],
    ["revoked", "user.employeeInvitationRevoked"],
  ])("names an invitation that became %s while the page was open", async (status, message) => {
    mocks.rpc.mockResolvedValueOnce({ data: [newAccountContext(status)], error: null });

    await expect(acceptEmployeeInvitationAction(initialEmployeeInvitationState, acceptanceForm()))
      .resolves.toMatchObject({ formError: message, ok: false });

    // A dead invitation may not change this account's password on its way to being refused.
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  // The other half of a lost answer: the membership landed and the reply did not. Retrying then
  // has to reach the same place succeeding first time would have, not a refusal.
  it("sends an invitee whose membership already landed on to the roster", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        account_existed_at_invitation: false,
        invitation_status: "accepted",
        locale: "en-AU",
        profile_full_name: "New Employee",
        profile_locale: "pt-BR",
      }],
      error: null,
    });

    await expect(acceptEmployeeInvitationAction(initialEmployeeInvitationState, acceptanceForm()))
      .rejects.toThrow("NEXT_REDIRECT:/pt-BR/roster");

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("ships every acceptance answer in both languages", () => {
    for (const message of [
      "user.employeeInvitationExpired",
      "user.employeeInvitationNotCompleted",
      "user.employeeInvitationPasswordSaved",
      "user.employeeInvitationReplaced",
      "user.employeeInvitationRevoked",
    ]) {
      for (const locale of ["en-AU", "pt-BR"] as const) {
        const localised = localiseUserMessage(message, locale);
        expect(localised?.trim(), `${message} in ${locale}`).toBeTruthy();
        // An absent key falls back to the generic sentence, which is the thing being replaced.
        expect(localised, `${message} in ${locale}`)
          .not.toBe(localiseUserMessage("user.notAKey", locale));
      }
    }
  });
});

// The invitation record lives seven days; the token in the e-mail dies on the first GET. A
// scanner or a reload spends it, and `prepare_employee_invitation` refuses while an
// invitation is open, so before this the only recourse was revoke-and-reinvite by an admin.

describe("requesting a fresh invitation link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Unconsumed `mockResolvedValueOnce` answers outlive `clearAllMocks`; draining them keeps a
    // test that stops early from failing the next one.
    mocks.rpc.mockReset();
    process.env.NEXT_PUBLIC_CRM_APP_URL = "https://crm.example.test/path";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
    process.env.SUPABASE_SECRET_KEY = "supabase-secret";
    // The invitee has no session, so the action reaches the database with the service role
    // rather than through requireCompanyOwner.
    mocks.createAdminClient.mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail: mocks.inviteUserByEmail,
          updateUserById: mocks.updateUserById,
        },
        resetPasswordForEmail: mocks.resetPasswordForEmail,
      },
      rpc: mocks.rpc,
    });
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
    mocks.updateUserById.mockResolvedValue({ data: { user: { id: inviteeUserId } }, error: null });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CRM_APP_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("re-sends the invitation that already exists rather than minting a new one", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          account_confirmed: false,
          claimed: true,
          invitee_email: "invitee@example.test",
          locale: "pt-BR",
        }],
        error: null,
      })
      .mockResolvedValueOnce(deliveryDetails());
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

  // CLE-100. The re-send passed `company_name: ""`, so the invitation the invitee asked for
  // came back as "Join the  team" — from nobody, for no company. There is no session here to
  // ask, which is why the company and the inviter are read from the invitation row.
  it.each(["en-AU", "pt-BR"] as const)(
    "re-sends a %s invitation that still names the company and the inviter",
    async (locale) => {
      mocks.rpc
        .mockResolvedValueOnce({
          data: [{
            account_confirmed: false,
            claimed: true,
            invitee_email: "invitee@example.test",
            locale,
          }],
          error: null,
        })
        .mockResolvedValueOnce(deliveryDetails());

      await expect(requestEmployeeInvitationLinkAction(invitationId))
        .resolves.toEqual({ ok: true });

      expect(mocks.rpc).toHaveBeenNthCalledWith(2, "employee_invitation_delivery_details", {
        target_invitation_id: invitationId,
      });
      expect(mocks.inviteUserByEmail).toHaveBeenCalledWith("invitee@example.test", {
        data: {
          company_name: "Coastal Demo Cleaning",
          invitation_kind: "employee",
          inviter_name: "Taylor Owner",
          preferred_locale: locale,
        },
        redirectTo: `https://crm.example.test/${locale}/auth/confirm/${invitationId}`,
      });
    },
  );

  // Without the company and the inviter there is no invitation worth sending, and the claim has
  // already reserved the minute. Giving it back lets the next tap send the right e-mail.
  it("sends nothing when the invitation could not be described", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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
      .mockResolvedValueOnce({ data: null, error: { message: "details unavailable" } })
      .mockResolvedValueOnce({ data: null, error: null });

    // The answer never varies: it would otherwise say which invitations are live.
    await expect(requestEmployeeInvitationLinkAction(invitationId)).resolves.toEqual({ ok: true });

    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "release_employee_invitation_link_claim", {
      target_invitation_id: invitationId,
    });

    consoleError.mockRestore();
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
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{
          account_confirmed: true,
          claimed: true,
          invitee_email: "invitee@example.test",
          locale: "en-AU",
        }],
        error: null,
      })
      .mockResolvedValueOnce(deliveryDetails());
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await expect(requestEmployeeInvitationLinkAction(invitationId)).resolves.toEqual({ ok: true });

    // The recovery template reads the account's metadata, so the company and the inviter have
    // to be written there before the send; nothing else can carry them.
    expect(mocks.updateUserById).toHaveBeenCalledWith(inviteeUserId, {
      user_metadata: {
        company_name: "Coastal Demo Cleaning",
        invitation_kind: "employee",
        inviter_name: "Taylor Owner",
        preferred_locale: "en-AU",
      },
    });
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
      .mockResolvedValueOnce(deliveryDetails())
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: "mailbox unavailable", status: 400 },
    });

    await expect(requestEmployeeInvitationLinkAction(invitationId)).resolves.toEqual({ ok: true });

    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "release_employee_invitation_link_claim", {
      target_invitation_id: invitationId,
    });
  });

  it("keeps the reservation when the message was accepted", async () => {
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
      .mockResolvedValueOnce(deliveryDetails());
    mocks.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await expect(requestEmployeeInvitationLinkAction(invitationId)).resolves.toEqual({ ok: true });

    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "release_employee_invitation_link_claim",
      expect.anything(),
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
