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

import {
  saveRecurringAssignment,
  setRecurringAssignmentActive,
} from "./recurring-assignments";

const validInput = {
  clientId: "10000000-0000-4000-8000-000000000301",
  siteId: "10000000-0000-4000-8000-000000000401",
  recurringAssignmentId: "",
  serviceId: "30000000-0000-4000-8000-000000000002",
  frequency: "weekly",
  anchorDate: "2026-08-11",
  startTime: "08:00",
  durationHours: "3",
  cleanerPayAud: "120.00",
  crewSize: "2",
  cleanerIds: ["10000000-0000-4000-8000-000000000002", ""],
};

describe("recurring assignment actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.requireCompanyAdmin.mockResolvedValue({
      supabase: { rpc: mocks.rpc },
    });
  });

  it("creates a rule through the atomic RPC and revalidates its client", async () => {
    await expect(saveRecurringAssignment(validInput)).resolves.toMatchObject({ ok: true });

    expect(mocks.rpc).toHaveBeenCalledWith("create_recurring_assignment", {
      target_site_id: validInput.siteId,
      target_service_id: validInput.serviceId,
      target_frequency: "weekly",
      target_weekday: 2,
      target_anchor_date: "2026-08-11",
      target_local_start_time: "08:00",
      target_duration_minutes: 180,
      target_cleaner_pay_cents: 12000,
      target_crew_size: 2,
      named_cleaner_ids: ["10000000-0000-4000-8000-000000000002"],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/en-AU/clients/${validInput.clientId}`,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/pt-BR/clients/${validInput.clientId}`,
    );
  });

  it("edits through the replacement RPC without changing cleaner order", async () => {
    const recurringAssignmentId = "10000000-0000-4000-8000-000000000701";
    await saveRecurringAssignment({
      ...validInput,
      recurringAssignmentId,
      cleanerIds: [
        "10000000-0000-4000-8000-000000000003",
        "10000000-0000-4000-8000-000000000002",
      ],
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_recurring_assignment",
      expect.objectContaining({
        target_recurring_assignment_id: recurringAssignmentId,
        named_cleaner_ids: [
          "10000000-0000-4000-8000-000000000003",
          "10000000-0000-4000-8000-000000000002",
        ],
      }),
    );
  });

  it("toggles active state through its narrow RPC", async () => {
    await setRecurringAssignmentActive({
      clientId: validInput.clientId,
      recurringAssignmentId: "10000000-0000-4000-8000-000000000701",
      active: false,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("set_recurring_assignment_active", {
      target_recurring_assignment_id: "10000000-0000-4000-8000-000000000701",
      target_active: false,
    });
  });

  it("rejects invalid payloads before authentication or mutation", async () => {
    const result = await saveRecurringAssignment({ ...validInput, crewSize: "0" });

    expect(result.ok).toBe(false);
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
