import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyAdmin: vi.fn(),
  revalidateLocalizedPath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));
vi.mock("@/i18n/revalidate", () => ({
  revalidateLocalizedPath: mocks.revalidateLocalizedPath,
}));

import { createPosting, revokePosting } from "./postings";

const companyId = "10000000-0000-4000-8000-000000000010";
const postingId = "59000000-0000-4000-8000-000000000501";
const jobId = "22000000-0000-4000-8000-000000000501";
const recurringAssignmentId = "10000000-0000-4000-8000-000000000701";

describe("CLE-60 posting actions", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: postingId, error: null });
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: companyId },
      supabase: { rpc },
    });
  });

  it.each([
    {
      input: {
        applicationCap: "",
        expiresAt: "",
        intent: "expression_of_interest",
        publicDescription: "Meet cleaners interested in future work.",
        targetId: "",
      },
      rpcInput: {
        posting_application_cap: undefined,
        posting_expires_at: undefined,
        public_description: "Meet cleaners interested in future work.",
        target_company_id: companyId,
        target_intent: "expression_of_interest",
        target_job_id: undefined,
        target_recurring_assignment_id: undefined,
      },
    },
    {
      input: {
        applicationCap: "12",
        expiresAt: "2026-09-10T17:30",
        intent: "one_time",
        publicDescription: "Cover one hotel clean.",
        targetId: jobId,
      },
      rpcInput: {
        posting_application_cap: 12,
        posting_expires_at: "2026-09-10T07:30:00.000Z",
        public_description: "Cover one hotel clean.",
        target_company_id: companyId,
        target_intent: "one_time",
        target_job_id: jobId,
        target_recurring_assignment_id: undefined,
      },
    },
    {
      input: {
        applicationCap: "20",
        expiresAt: "2026-09-20T08:00",
        intent: "regular",
        publicDescription: "Join a regular hotel roster.",
        targetId: recurringAssignmentId,
      },
      rpcInput: {
        posting_application_cap: 20,
        posting_expires_at: "2026-09-19T22:00:00.000Z",
        public_description: "Join a regular hotel roster.",
        target_company_id: companyId,
        target_intent: "regular",
        target_job_id: undefined,
        target_recurring_assignment_id: recurringAssignmentId,
      },
    },
  ])("creates $input.intent through the posting RPC", async ({ input, rpcInput }) => {
    const result = await createPosting(input);

    expect(result).toEqual({ ok: true, postingId });
    expect(rpc).toHaveBeenCalledWith("create_posting", rpcInput);
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith("/cleaners");
  });

  it("rejects a mismatched target before authorisation", async () => {
    const result = await createPosting({
      applicationCap: "",
      expiresAt: "",
      intent: "one_time",
      publicDescription: "Cover one hotel clean.",
      targetId: "",
    });

    expect(result).toMatchObject({
      fieldErrors: { targetId: "user.postingTargetRequired" },
      ok: false,
    });
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
  });

  it.each(["2026-02-30T10:00", "2026-09-10T17:30:00"])(
    "rejects invalid browser expiry %s before authorisation",
    async (expiresAt) => {
      const result = await createPosting({
        applicationCap: "",
        expiresAt,
        intent: "expression_of_interest",
        publicDescription: "Meet cleaners interested in future work.",
        targetId: "",
      });

      expect(result).toMatchObject({
        fieldErrors: { expiresAt: "user.postingExpiryInvalid" },
        ok: false,
      });
      expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
    },
  );

  it("returns the stable application-cap validation token", async () => {
    const result = await createPosting({
      applicationCap: "0",
      expiresAt: "",
      intent: "expression_of_interest",
      publicDescription: "Meet cleaners interested in future work.",
      targetId: "",
    });

    expect(result).toMatchObject({
      fieldErrors: { applicationCap: "user.postingCapPositive" },
      ok: false,
    });
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
  });

  it("revokes through the security-definer RPC", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(revokePosting(postingId)).resolves.toEqual({ ok: true });

    expect(rpc).toHaveBeenCalledWith("revoke_posting", { target_posting_id: postingId });
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith("/cleaners");
  });
});
