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
  retryFailedCleanerInviteEmails,
  sendCleanerInviteEmails,
} from "./cleaner-email";

const companyId = "10000000-0000-4000-8000-000000000010";
const inviteId = "10000000-0000-4000-8000-000000000020";
const batchId = "10000000-0000-4000-8000-000000000030";
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

describe("CLE-79 cleaner invitation email actions", () => {
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
    const result = await sendCleanerInviteEmails({
      authorityConfirmed: true,
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
      newlyQueued: 1,
      ok: true,
      reusedExisting: false,
    });
    expect(mocks.requireCompanyAdmin).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenNthCalledWith(1, "prepare_pool_invite_email_batch", {
      authority_confirmed: true,
      confirmation_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
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
        from: '"Coastal Cleaning via The Clean Crew" <invite@example.com>',
        replyTo: "admin@example.com",
      }),
    );
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects malformed or unconfirmed input before authentication", async () => {
    const result = await sendCleanerInviteEmails({
      authorityConfirmed: false,
      inviteId,
      locale: "en-AU",
      recipients: [{ email: "not-an-email", name: null }],
    });

    expect(result).toEqual({ ok: false, error: "user.cleanerEmailInvalidInput" });
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects more than 500 recipients before authentication", async () => {
    const result = await sendCleanerInviteEmails({
      authorityConfirmed: true,
      inviteId,
      locale: "en-AU",
      recipients: Array.from({ length: 501 }, (_, index) => ({
        email: `cleaner-${index}@example.com`,
        name: null,
      })),
    });

    expect(result).toEqual({ ok: false, error: "user.cleanerEmailInvalidInput" });
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("derives one confirmation key for the same normalised send list", async () => {
    rpc.mockReset();
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
      })
      .mockResolvedValueOnce({
        data: [{
          ...preparedRows()[0],
          provider_message_id: "provider-1",
          status: "accepted",
        }],
        error: null,
      });

    await sendCleanerInviteEmails({
      authorityConfirmed: true,
      inviteId,
      locale: "en-AU",
      recipients: [
        { email: "ana@example.com", name: "Ana" },
        { email: "bruno@example.com", name: null },
      ],
    });
    const repeated = await sendCleanerInviteEmails({
      authorityConfirmed: true,
      inviteId,
      locale: "en-AU",
      recipients: [
        { email: "BRUNO@example.com", name: "Changed name" },
        { email: "ANA@example.com", name: "Ana" },
      ],
    });

    const firstKey = rpc.mock.calls[0]?.[1].confirmation_key;
    const repeatedKey = rpc.mock.calls[2]?.[1].confirmation_key;
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(repeatedKey).toBe(firstKey);
    expect(mocks.sendResendEmailBatches).toHaveBeenCalledTimes(1);
    expect(repeated).toMatchObject({
      newlyQueued: 0,
      ok: true,
      reusedExisting: true,
    });
  });

  it("quotes commas and escaped quotes in the sender display name", async () => {
    mocks.requireCompanyAdmin.mockResolvedValueOnce({
      company: { id: companyId, name: 'Coastal Cleaning, "Gold Coast"' },
      supabase: {
        auth: { admin: { inviteUserByEmail } },
        rpc,
      },
      user: { email: "admin@example.com" },
    });

    await sendCleanerInviteEmails({
      authorityConfirmed: true,
      inviteId,
      locale: "en-AU",
      recipients: [{ email: "ana@example.com", name: null }],
    });

    expect(mocks.sendResendEmailBatches).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Coastal Cleaning, \\"Gold Coast\\" via The Clean Crew" <invite@example.com>',
      }),
    );
  });

  it("returns a safe setup error when the Resend configuration is missing", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendCleanerInviteEmails({
      authorityConfirmed: true,
      inviteId,
      locale: "en-AU",
      recipients: [{ email: "ana@example.com", name: null }],
    });

    expect(result).toEqual({ ok: false, error: "user.cleanerEmailNotConfigured" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not expose a rejected database request", async () => {
    rpc.mockReset();
    rpc.mockRejectedValueOnce(new Error("database connection secret"));

    await expect(sendCleanerInviteEmails({
      authorityConfirmed: true,
      inviteId,
      locale: "en-AU",
      recipients: [{ email: "ana@example.com", name: null }],
    })).resolves.toEqual({
      error: "user.cleanerEmailPrepareFailed",
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

    const result = await retryFailedCleanerInviteEmails({ batchId, retryKey });

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
