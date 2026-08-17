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

import { assignJobSlot, cancelJob, createOneOffJob } from "./jobs";

const jobId = "23000000-0000-4000-8000-000000000501";

function expectLocalizedRevalidation(path: string) {
  expect(mocks.revalidatePath).toHaveBeenCalledWith(`/en-AU${path}`);
  expect(mocks.revalidatePath).toHaveBeenCalledWith(`/pt-BR${path}`);
}

function validFormData() {
  const formData = new FormData();
  formData.set("clientId", "10000000-0000-4000-8000-000000000301");
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

function validAssignmentFormData() {
  const formData = new FormData();
  formData.set("jobId", jobId);
  formData.set("slotNumber", "2");
  formData.set("cleanerId", "10000000-0000-4000-8000-000000000003");
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
    expectLocalizedRevalidation("/jobs");
    expectLocalizedRevalidation(`/jobs/${jobId}`);
    expectLocalizedRevalidation("/roster");
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

  it("reports the selectable client when both client and disabled site are missing", async () => {
    const formData = validFormData();
    formData.delete("clientId");
    formData.delete("siteId");

    const result = await createOneOffJob(formData);

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { clientId: "user.chooseClient" },
    });
    expect(result.fieldErrors.siteId).toBeUndefined();
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
      formError: "user.jobSaveFailed",
    });
  });

  it("does not encourage a duplicate retry when the committed result is unknown", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(createOneOffJob(validFormData())).resolves.toMatchObject({
      ok: false,
      jobId: null,
      formError: "user.jobSaveUnconfirmed",
    });
    expectLocalizedRevalidation("/jobs");
    expectLocalizedRevalidation("/roster");
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
      formError: "user.jobSaveUnconfirmed",
    });
    expectLocalizedRevalidation("/jobs");
    expectLocalizedRevalidation("/roster");
  });

  it("treats a rejected RPC client as an indeterminate commit", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("custom client rejected"));

    await expect(createOneOffJob(validFormData())).resolves.toMatchObject({
      ok: false,
      jobId: null,
      formError: "user.jobSaveUnconfirmed",
    });
    expectLocalizedRevalidation("/jobs");
    expectLocalizedRevalidation("/roster");
  });
});

describe("CLE-22 job dispatch actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: null, error: null, status: 200 });
    mocks.requireCompanyAdmin.mockResolvedValue({
      supabase: { rpc: mocks.rpc },
    });
  });

  it("assigns the chosen cleaner to the exact crew slot and refreshes every consumer", async () => {
    mocks.rpc.mockResolvedValue({
      data: "49000000-0000-4000-8000-000000000701",
      error: null,
      status: 200,
    });

    await expect(assignJobSlot(validAssignmentFormData())).resolves.toEqual({
      ok: true,
      formError: null,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("assign_job_slot", {
      target_job_id: jobId,
      target_slot_number: 2,
      target_cleaner_id: "10000000-0000-4000-8000-000000000003",
    });
    expectLocalizedRevalidation(`/jobs/${jobId}`);
    expectLocalizedRevalidation("/jobs");
    expectLocalizedRevalidation("/roster");
  });

  it("rejects invalid assignment payloads before authentication", async () => {
    const formData = validAssignmentFormData();
    formData.set("slotNumber", "0");

    await expect(assignJobSlot(formData)).resolves.toMatchObject({
      ok: false,
      formError: "user.validAssignment",
    });
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows only the safe availability domain error", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Cleaner is unavailable for this time" },
      status: 400,
    });

    await expect(assignJobSlot(validAssignmentFormData())).resolves.toEqual({
      ok: false,
      formError: "user.cleanerUnavailable",
    });
  });

  it("refreshes stale assignment state without exposing database details", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Crew slot is already assigned" },
      status: 409,
    });

    await expect(assignJobSlot(validAssignmentFormData())).resolves.toEqual({
      ok: false,
      formError: "user.jobChanged",
    });
    expectLocalizedRevalidation(`/jobs/${jobId}`);
  });

  it("cancels through the loop RPC and refreshes vacancies and roster state", async () => {
    await expect(cancelJob(jobId)).resolves.toEqual({ ok: true, formError: null });

    expect(mocks.rpc).toHaveBeenCalledWith("cancel_job", {
      target_job_id: jobId,
    });
    expectLocalizedRevalidation(`/jobs/${jobId}`);
    expectLocalizedRevalidation("/jobs");
    expectLocalizedRevalidation("/roster");
  });

  it("returns one generic cancellation failure for foreign, missing, or closed jobs", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Company admin access required" },
      status: 403,
    });

    await expect(cancelJob(jobId)).resolves.toEqual({
      ok: false,
      formError: "user.jobCancelChanged",
    });
  });

  it("treats a status-zero cancellation response as an indeterminate commit", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Failed to fetch" },
      status: 0,
    });

    await expect(cancelJob(jobId)).resolves.toEqual({
      ok: false,
      formError: "user.cancellationUnconfirmed",
    });
    expectLocalizedRevalidation(`/jobs/${jobId}`);
  });
});
