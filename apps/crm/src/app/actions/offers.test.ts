import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyAdmin: vi.fn(),
  revalidateLocalizedPath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/i18n/revalidate", () => ({
  revalidateLocalizedPath: mocks.revalidateLocalizedPath,
}));
vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));

import { offerJob, revokeJobOffer } from "./offers";

const jobId = "23000000-0000-4000-8000-000000000501";
const cleanerId = "10000000-0000-4000-8000-000000000003";
const offerId = "51000000-0000-4000-8000-000000000801";

function validOfferFormData() {
  const formData = new FormData();
  formData.set("jobId", jobId);
  formData.set("cleanerId", cleanerId);
  return formData;
}

function expectJobRevalidation() {
  expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith(`/jobs/${jobId}`);
  expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith("/jobs");
  expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith("/roster");
}

describe("CLE-53 job offer actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCompanyAdmin.mockResolvedValue({ supabase: { rpc: mocks.rpc } });
    mocks.rpc.mockResolvedValue({ data: offerId, error: null, status: 200 });
  });

  it("offers the job through the atomic RPC and refreshes every job consumer", async () => {
    await expect(offerJob(validOfferFormData())).resolves.toEqual({
      ok: true,
      formError: null,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("offer_job", {
      target_job_id: jobId,
      target_cleaner_id: cleanerId,
    });
    expectJobRevalidation();
  });

  it("rejects malformed offer identity before authentication", async () => {
    const formData = validOfferFormData();
    formData.set("cleanerId", "not-a-uuid");

    await expect(offerJob(formData)).resolves.toEqual({
      ok: false,
      formError: "user.validJobOffer",
    });
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("revokes only the pending offer through its RPC and refreshes consumers", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null, status: 200 });

    await expect(revokeJobOffer(jobId, offerId)).resolves.toEqual({
      ok: true,
      formError: null,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_offer", {
      target_offer_id: offerId,
    });
    expectJobRevalidation();
  });
});
