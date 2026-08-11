import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));

import { createOneOffJob } from "./jobs";

const jobId = "23000000-0000-4000-8000-000000000501";

function validFormData() {
  const formData = new FormData();
  formData.set("siteId", "10000000-0000-4000-8000-000000000401");
  formData.set("serviceId", "30000000-0000-4000-8000-000000000003");
  formData.set("date", "2026-08-19");
  formData.set("startTime", "08:30");
  formData.set("durationHours", "2.5");
  formData.set("cleanerPayAud", "150.75");
  formData.set("clientChargeAud", "420");
  formData.set("crewSize", "2");
  formData.set("notes", "  Focus on the kitchen  ");
  formData.set("mode", "post");
  return formData;
}

describe("CLE-23 one-off job action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: jobId, error: null });
    mocks.requireCompanyAdmin.mockResolvedValue({
      supabase: { rpc: mocks.rpc },
    });
  });

  it("creates and posts through one atomic RPC using edited values", async () => {
    await expect(createOneOffJob(validFormData())).resolves.toMatchObject({
      ok: true,
      jobId,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("create_one_off_job", {
      target_site_id: "10000000-0000-4000-8000-000000000401",
      target_service_id: "30000000-0000-4000-8000-000000000003",
      target_local_date: "2026-08-19",
      target_local_start_time: "08:30",
      target_duration_minutes: 150,
      target_cleaner_pay_cents: 15075,
      target_crew_size: 2,
      target_post_now: true,
      target_client_charge_cents: 42000,
      target_notes: "Focus on the kitchen",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/jobs");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/jobs/${jobId}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/roster");
  });

  it("passes nullable client charge and notes when saving a draft", async () => {
    const formData = validFormData();
    formData.set("clientChargeAud", "");
    formData.set("notes", "");
    formData.set("mode", "draft");

    await createOneOffJob(formData);

    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_one_off_job",
      expect.objectContaining({
        target_post_now: false,
        target_client_charge_cents: undefined,
        target_notes: undefined,
      }),
    );
  });

  it("rejects invalid payloads before authentication or mutation", async () => {
    const formData = validFormData();
    formData.set("crewSize", "0");

    const result = await createOneOffJob(formData);

    expect(result.ok).toBe(false);
    expect(result.fieldErrors.crewSize).toBeTruthy();
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns a retryable form error when the database rejects the request", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Company admin access required" },
    });

    await expect(createOneOffJob(validFormData())).resolves.toMatchObject({
      ok: false,
      jobId: null,
      formError: "The job could not be saved. Please try again.",
    });
  });

  it("does not encourage a duplicate retry when the committed result is unknown", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(createOneOffJob(validFormData())).resolves.toMatchObject({
      ok: false,
      jobId: null,
      formError: expect.stringContaining("could not be confirmed"),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/jobs");
  });

  it("treats a status-zero transport error as an indeterminate commit", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Failed to fetch" },
      status: 0,
    });

    await expect(createOneOffJob(validFormData())).resolves.toMatchObject({
      ok: false,
      jobId: null,
      formError: expect.stringContaining("could not be confirmed"),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/jobs");
  });
});
