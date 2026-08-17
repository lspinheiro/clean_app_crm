import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyAdmin: vi.fn(),
  sendResendEmailBatches: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));
vi.mock("@/lib/resend", () => ({
  sendResendEmailBatches: mocks.sendResendEmailBatches,
}));

import {
  retryFailedPoolInviteEmails,
  sendPoolInviteEmails,
} from "./pool-email";

const companyId = "10000000-0000-4000-8000-000000000010";
const inviteId = "10000000-0000-4000-8000-000000000020";
const batchId = "10000000-0000-4000-8000-000000000030";
const confirmationKey = "10000000-0000-4000-8000-000000000040";
const retryKey = "10000000-0000-4000-8000-000000000050";

function preparedRows(attemptNumber = 0) {
  return [
    {
      attempt_number: attemptNumber,
      batch_id: batchId,
      email: "ana@example.com",
      failure_reason: null,
      invite_code: "AB12CD",
      locale: "en-AU",
      name: "Ana",
      provider_message_id: null,
      recipient_id: "10000000-0000-4000-8000-000000000101",
      status: "pending",
    },
  ];
}

describe("CLE-79 pool invitation email actions", () => {
  const rpc = vi.fn();
  const inviteUserByEmail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "server-secret";
    process.env.RESEND_FROM_EMAIL = "invite@example.com";
    process.env.NEXT_PUBLIC_CLEANER_APP_URL = "https://cleaner.example.test";
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: companyId, name: "Coastal Cleaning" },
      supabase: {
        auth: { admin: { inviteUserByEmail } },
        rpc,
      },
      user: { email: "admin@example.com" },
    });
    rpc
      .mockResolvedValueOnce({ data: preparedRows(), error: null })
      .mockResolvedValueOnce({
        data: [
          {
            email: "ana@example.com",
            failure_reason: null,
            name: "Ana",
            provider_message_id: "provider-1",
            recipient_id: "10000000-0000-4000-8000-000000000101",
            status: "accepted",
          },
        ],
        error: null,
      });
    mocks.sendResendEmailBatches.mockResolvedValue([
      {
        providerMessageId: "provider-1",
        recipientId: "10000000-0000-4000-8000-000000000101",
        status: "accepted",
      },
    ]);
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.NEXT_PUBLIC_CLEANER_APP_URL;
  });

  it("re-authorises, normalises recipients, and never creates Auth users", async () => {
    const result = await sendPoolInviteEmails({
      authorityConfirmed: true,
      confirmationKey,
      inviteId,
      locale: "en-AU",
      recipients: [
        { email: " Ana@example.com ", name: " Ana " },
        { email: "ana@EXAMPLE.com", name: "Duplicate" },
      ],
    });

    expect(result).toMatchObject({
      accepted: [{ email: "ana@example.com" }],
      batchId,
      failed: [],
      ok: true,
    });
    expect(mocks.requireCompanyAdmin).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenNthCalledWith(1, "prepare_pool_invite_email_batch", {
      authority_confirmed: true,
      confirmation_key: confirmationKey,
      recipients: [{ email: "ana@example.com", name: "Ana" }],
      selected_invite_id: inviteId,
      selected_locale: "en-AU",
      target_company_id: companyId,
    });
    expect(mocks.sendResendEmailBatches).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "server-secret",
        attemptNumber: 0,
        batchId,
        from: "Coastal Cleaning via The Clean Crew <invite@example.com>",
        replyTo: "admin@example.com",
      }),
    );
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects malformed or unconfirmed input before authentication", async () => {
    const result = await sendPoolInviteEmails({
      authorityConfirmed: false,
      confirmationKey,
      inviteId,
      locale: "en-AU",
      recipients: [{ email: "not-an-email", name: null }],
    });

    expect(result).toEqual({ ok: false, error: "user.poolEmailInvalidInput" });
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a safe setup error when the Resend configuration is missing", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendPoolInviteEmails({
      authorityConfirmed: true,
      confirmationKey,
      inviteId,
      locale: "en-AU",
      recipients: [{ email: "ana@example.com", name: null }],
    });

    expect(result).toEqual({ ok: false, error: "user.poolEmailNotConfigured" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not expose a rejected database request", async () => {
    rpc.mockReset();
    rpc.mockRejectedValueOnce(new Error("database connection secret"));

    await expect(sendPoolInviteEmails({
      authorityConfirmed: true,
      confirmationKey,
      inviteId,
      locale: "en-AU",
      recipients: [{ email: "ana@example.com", name: null }],
    })).resolves.toEqual({
      error: "user.poolEmailPrepareFailed",
      ok: false,
    });
  });

  it("retries only recipients prepared as failed by the company-scoped RPC", async () => {
    rpc.mockReset();
    rpc
      .mockResolvedValueOnce({ data: preparedRows(1), error: null })
      .mockResolvedValueOnce({
        data: [
          {
            email: "ana@example.com",
            failure_reason: null,
            name: "Ana",
            provider_message_id: "provider-2",
            recipient_id: "10000000-0000-4000-8000-000000000101",
            status: "accepted",
          },
        ],
        error: null,
      });
    mocks.sendResendEmailBatches.mockResolvedValueOnce([
      {
        providerMessageId: "provider-2",
        recipientId: "10000000-0000-4000-8000-000000000101",
        status: "accepted",
      },
    ]);

    const result = await retryFailedPoolInviteEmails({ batchId, retryKey });

    expect(result).toMatchObject({ ok: true, failed: [] });
    expect(rpc).toHaveBeenNthCalledWith(1, "prepare_pool_invite_email_retry", {
      retry_key: retryKey,
      selected_batch_id: batchId,
    });
    expect(mocks.sendResendEmailBatches).toHaveBeenCalledWith(
      expect.objectContaining({ attemptNumber: 1, batchId }),
    );
  });
});
