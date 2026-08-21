import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyOwner: vi.fn(),
  revalidateLocalizedPath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyOwner: mocks.requireCompanyOwner,
}));
vi.mock("@/i18n/revalidate", () => ({
  revalidateLocalizedPath: mocks.revalidateLocalizedPath,
}));

import {
  changeEmployeeRoleAction,
  removeEmployeeAction,
} from "./employee-management";

const companyId = "10000000-0000-4000-8000-000000000030";
const membershipId = "10000000-0000-4000-8000-000000000096";

describe("CLE-84 owner employee management actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.requireCompanyOwner.mockResolvedValue({
      company: { id: companyId },
      supabase: { rpc: mocks.rpc },
    });
  });

  it("validates role-change input before resolving owner authority", async () => {
    await expect(changeEmployeeRoleAction({
      membershipId: "not-a-membership",
      role: "manager",
    })).resolves.toMatchObject({ ok: false });

    expect(mocks.requireCompanyOwner).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("changes role only through the active-company RPC and refreshes settings", async () => {
    await expect(changeEmployeeRoleAction({ membershipId, role: "owner" }))
      .resolves.toEqual({ ok: true });

    expect(mocks.rpc).toHaveBeenCalledWith("change_employee_role", {
      target_company_id: companyId,
      target_membership_id: membershipId,
      target_role: "owner",
    });
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith("/settings");
  });

  it("removes only through the active-company RPC and refreshes settings", async () => {
    await expect(removeEmployeeAction({ membershipId })).resolves.toEqual({ ok: true });

    expect(mocks.rpc).toHaveBeenCalledWith("remove_employee", {
      target_company_id: companyId,
      target_membership_id: membershipId,
    });
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith("/settings");
  });

  it("maps the database owner invariant to a clear user message", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "Company must retain at least one active owner",
      },
    });

    await expect(removeEmployeeAction({ membershipId })).resolves.toEqual({
      formError: "user.lastCompanyOwnerRequired",
      ok: false,
    });
    expect(mocks.revalidateLocalizedPath).not.toHaveBeenCalled();
  });
});
