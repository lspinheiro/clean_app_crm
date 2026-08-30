import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyAdmin: vi.fn(),
  sendResendEmailBatches: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireCompanyAdmin: mocks.requireCompanyAdmin }));
vi.mock("@/lib/resend", () => ({ sendResendEmailBatches: mocks.sendResendEmailBatches }));

import { retryFailedCleanerInviteEmails, sendCleanerInviteEmails } from "./cleaner-email";

const companyId = "10000000-0000-4000-8000-000000000010";
const postingId = "59000000-0000-4000-8000-000000000501";
const retryKey = "10000000-0000-4000-8000-000000000050";

function postingQuery(data: unknown = {
  code: "AB12CD34EF56GH78",
  id: postingId,
  intent: "one_time",
  state: "active",
}) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("CLE-60 posting email actions", () => {
  let query: ReturnType<typeof postingQuery>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "server-secret";
    process.env.RESEND_FROM_EMAIL = "invite@example.com";
    process.env.NEXT_PUBLIC_CLEANER_APP_URL = "https://cleaner.example.test";
    query = postingQuery();
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: companyId, name: "Coastal Cleaning" },
      supabase: { from: vi.fn().mockReturnValue(query), rpc: vi.fn() },
      user: { email: "admin@example.com" },
    });
    mocks.sendResendEmailBatches.mockImplementation(async (input: {
      messages: Array<{ recipientId: string }>;
    }) =>
      input.messages.map((message, index) => ({
        providerMessageId: `provider-${index + 1}`,
        recipientId: message.recipientId,
        status: "accepted" as const,
      })),
    );
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.NEXT_PUBLIC_CLEANER_APP_URL;
  });

  it("sends the selected active posting without the retired invite batch RPCs", async () => {
    const rpc = vi.fn();
    mocks.requireCompanyAdmin.mockResolvedValueOnce({
      company: { id: companyId, name: "Coastal Cleaning" },
      supabase: { from: vi.fn().mockReturnValue(query), rpc },
      user: { email: "admin@example.com" },
    });

    const result = await sendCleanerInviteEmails({
      authorityConfirmed: true,
      locale: "en-AU",
      postingId,
      recipients: [
        { email: " Ana@example.com ", name: " Ana " },
        { email: "ana@EXAMPLE.com", name: "Duplicate" },
      ],
    });

    expect(result).toMatchObject({ accepted: [{ email: "ana@example.com" }], failed: [], ok: true });
    expect(result).not.toHaveProperty("newlyQueued");
    expect(result).not.toHaveProperty("reusedExisting");
    expect(query.eq).toHaveBeenCalledWith("id", postingId);
    expect(query.eq).toHaveBeenCalledWith("company_id", companyId);
    expect(query.eq).toHaveBeenCalledWith("state", "active");
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.sendResendEmailBatches).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "server-secret",
      attemptNumber: 0,
      from: '"Coastal Cleaning via The Clean Crew" <invite@example.com>',
      idempotencyNamespace: "cleaner-posting",
      messages: [expect.objectContaining({
        subject: "Cleaning opportunity with Coastal Cleaning",
        text: expect.stringContaining("https://cleaner.example.test/join?code=AB12CD34EF56GH78"),
        to: "ana@example.com",
      })],
      replyTo: "admin@example.com",
    }));
  });

  it("rejects malformed or unconfirmed input before authentication", async () => {
    await expect(sendCleanerInviteEmails({
      authorityConfirmed: false,
      locale: "en-AU",
      postingId,
      recipients: [{ email: "not-an-email", name: null }],
    })).resolves.toEqual({ error: "user.cleanerEmailInvalidInput", ok: false });
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
  });

  it("rejects more than 500 recipients before authentication", async () => {
    await expect(sendCleanerInviteEmails({
      authorityConfirmed: true,
      locale: "en-AU",
      postingId,
      recipients: Array.from({ length: 501 }, (_, index) => ({
        email: `cleaner-${index}@example.com`,
        name: null,
      })),
    })).resolves.toEqual({ error: "user.cleanerEmailInvalidInput", ok: false });
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
  });

  it("derives a stable provider batch id for the same normalised send list", async () => {
    const input = {
      authorityConfirmed: true as const,
      locale: "en-AU" as const,
      postingId,
      recipients: [
        { email: "ana@example.com", name: "Ana" },
        { email: "bruno@example.com", name: null },
      ],
    };
    await sendCleanerInviteEmails(input);
    await sendCleanerInviteEmails({
      ...input,
      recipients: [...input.recipients].reverse().map((recipient) => ({
        ...recipient,
        email: recipient.email.toUpperCase(),
      })),
    });

    expect(mocks.sendResendEmailBatches.mock.calls[0]?.[0].batchId)
      .toBe(mocks.sendResendEmailBatches.mock.calls[1]?.[0].batchId);
  });

  it("matches provider outcomes to recipients by recipient id rather than array order", async () => {
    mocks.sendResendEmailBatches.mockImplementationOnce(async (input) => {
      const [ana, bruno] = input.messages;
      if (!ana || !bruno) throw new Error("Expected two outbound messages");
      return [
        {
          providerMessageId: "provider-bruno",
          recipientId: bruno.recipientId,
          status: "accepted" as const,
        },
        {
          failureReason: "provider_rejected" as const,
          recipientId: ana.recipientId,
          status: "failed" as const,
        },
      ];
    });

    const result = await sendCleanerInviteEmails({
      authorityConfirmed: true,
      locale: "en-AU",
      postingId,
      recipients: [
        { email: "ana@example.com", name: "Ana" },
        { email: "bruno@example.com", name: "Bruno" },
      ],
    });

    expect(result).toMatchObject({
      accepted: [{ email: "bruno@example.com" }],
      failed: [{ email: "ana@example.com", failureReason: "provider_rejected" }],
      ok: true,
    });
  });

  it("quotes commas and escaped quotes in the sender display name", async () => {
    mocks.requireCompanyAdmin.mockResolvedValueOnce({
      company: { id: companyId, name: 'Coastal Cleaning, "Gold Coast"' },
      supabase: { from: vi.fn().mockReturnValue(query) },
      user: { email: "admin@example.com" },
    });

    await sendCleanerInviteEmails({
      authorityConfirmed: true,
      locale: "en-AU",
      postingId,
      recipients: [{ email: "ana@example.com", name: null }],
    });

    expect(mocks.sendResendEmailBatches).toHaveBeenCalledWith(expect.objectContaining({
      from: '"Coastal Cleaning, \\"Gold Coast\\" via The Clean Crew" <invite@example.com>',
    }));
  });

  it("returns a safe setup error when Resend is missing", async () => {
    delete process.env.RESEND_API_KEY;

    await expect(sendCleanerInviteEmails({
      authorityConfirmed: true,
      locale: "en-AU",
      postingId,
      recipients: [{ email: "ana@example.com", name: null }],
    })).resolves.toEqual({ error: "user.cleanerEmailNotConfigured", ok: false });
    expect(mocks.sendResendEmailBatches).not.toHaveBeenCalled();
  });

  it("refuses a closed, foreign, or malformed posting without provider delivery", async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(sendCleanerInviteEmails({
      authorityConfirmed: true,
      locale: "en-AU",
      postingId,
      recipients: [{ email: "ana@example.com", name: null }],
    })).resolves.toEqual({ error: "user.cleanerEmailPrepareFailed", ok: false });
    expect(mocks.sendResendEmailBatches).not.toHaveBeenCalled();
  });

  it("maps a rejected posting-state read to a safe preparation error", async () => {
    query.maybeSingle.mockRejectedValueOnce(new Error("database connection secret"));

    await expect(sendCleanerInviteEmails({
      authorityConfirmed: true,
      locale: "en-AU",
      postingId,
      recipients: [{ email: "ana@example.com", name: null }],
    })).resolves.toEqual({ error: "user.cleanerEmailPrepareFailed", ok: false });
    expect(mocks.sendResendEmailBatches).not.toHaveBeenCalled();
  });

  it("re-authorises, re-checks posting state, and retries only supplied failed recipients", async () => {
    const result = await retryFailedCleanerInviteEmails({
      authorityConfirmed: true,
      locale: "pt-BR",
      postingId,
      recipients: [{ email: "failed@example.com", name: "Falhou" }],
      retryKey,
    });

    expect(result).toMatchObject({ accepted: [{ email: "failed@example.com" }], ok: true });
    expect(mocks.requireCompanyAdmin).toHaveBeenCalledOnce();
    expect(mocks.sendResendEmailBatches).toHaveBeenCalledWith(expect.objectContaining({
      attemptNumber: 1,
      batchId: retryKey,
      messages: [expect.objectContaining({ to: "failed@example.com" })],
    }));
  });
});
