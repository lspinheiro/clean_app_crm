import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  getCompanyLogoUrl: vi.fn(),
  order: vi.fn(),
  requireCompanyOwner: vi.fn(),
  select: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyOwner: mocks.requireCompanyOwner,
}));

vi.mock("@/lib/company-logo", () => ({
  getCompanyLogoUrl: mocks.getCompanyLogoUrl,
}));

import SettingsPage from "./page";

afterEach(cleanup);

describe("company settings language control", () => {
  function ownerContext(invitations: unknown[] = [], employees: unknown[] = []) {
    let currentRelation = "";
    const query = {
      eq: mocks.eq,
      order: mocks.order,
      select: mocks.select,
    };
    mocks.from.mockImplementation((relation: string) => {
      currentRelation = relation;
      return query;
    });
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.order.mockImplementation(() => Promise.resolve({
      data: currentRelation === "employee_membership_details" ? employees : invitations,
      error: null,
    }));
    return {
      company: {
        abn: "53004085616",
        id: "10000000-0000-4000-8000-000000000010",
        logo_path: null,
        name: "Coastal Demo Cleaning",
        timezone: "Australia/Brisbane",
      },
      profile: { preferred_locale: "en-AU" },
      supabase: { from: mocks.from },
    };
  }

  it("offers both alpha languages without translating their names", async () => {
    mocks.requireCompanyOwner.mockResolvedValue(ownerContext());
    mocks.getCompanyLogoUrl.mockResolvedValue(null);

    render(await SettingsPage());

    expect(screen.getByRole("combobox", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "English (Australia)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Português (Brasil)" })).toBeInTheDocument();
  });

  it("reports the saved profile preference instead of the bookmarked route locale", async () => {
    mocks.requireCompanyOwner.mockResolvedValue({
      ...ownerContext(),
      profile: { preferred_locale: "pt-BR" },
    });
    mocks.getCompanyLogoUrl.mockResolvedValue(null);

    render(await SettingsPage());

    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("pt-BR");
  });

  it("shows role selection and all four employee invitation states to an owner", async () => {
    mocks.requireCompanyOwner.mockResolvedValue(ownerContext([
      {
        accepted_at: null,
        created_at: "2026-08-20T00:00:00.000Z",
        email: "pending@example.test",
        expires_at: "2099-08-27T00:00:00.000Z",
        id: "83000000-0000-4000-8000-000000000101",
        invitation_state: "pending",
        revoked_at: null,
        role: "staff",
      },
      {
        accepted_at: "2026-08-19T00:00:00.000Z",
        created_at: "2026-08-18T00:00:00.000Z",
        email: "accepted@example.test",
        expires_at: "2026-08-25T00:00:00.000Z",
        id: "83000000-0000-4000-8000-000000000102",
        invitation_state: "accepted",
        revoked_at: null,
        role: "owner",
      },
      {
        accepted_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
        email: "expired@example.test",
        expires_at: "2026-08-08T00:00:00.000Z",
        id: "83000000-0000-4000-8000-000000000103",
        invitation_state: "expired",
        revoked_at: null,
        role: "staff",
      },
      {
        accepted_at: null,
        created_at: "2026-08-17T00:00:00.000Z",
        email: "revoked@example.test",
        expires_at: "2026-08-24T00:00:00.000Z",
        id: "83000000-0000-4000-8000-000000000104",
        invitation_state: "revoked",
        revoked_at: "2026-08-18T00:00:00.000Z",
        role: "owner",
      },
    ]));
    mocks.getCompanyLogoUrl.mockResolvedValue(null);

    render(await SettingsPage());

    expect(screen.getByRole("heading", { name: "Invite an employee" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Role" })).toHaveValue("staff");
    expect(screen.getByRole("option", { name: "Owner" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Staff" })).toBeInTheDocument();
    for (const state of ["Pending", "Accepted", "Expired", "Revoked"]) {
      expect(screen.getByText(state, { exact: true })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Revoke pending@example.test" }))
      .toBeInTheDocument();
    expect(screen.queryByText(/resend/i)).not.toBeInTheDocument();
    expect(mocks.eq).toHaveBeenCalledWith(
      "company_id",
      "10000000-0000-4000-8000-000000000010",
    );
    expect(mocks.from).toHaveBeenCalledWith("employee_invitation_states");
  });

  it("shows active employees with identity, role, and Brisbane joined date", async () => {
    mocks.requireCompanyOwner.mockResolvedValue(ownerContext([], [
      {
        company_id: "10000000-0000-4000-8000-000000000010",
        email: "admin@clean-app.example.test",
        full_name: "Demo Company Admin",
        joined_at: "2026-08-01T00:00:00+10:00",
        membership_id: "10000000-0000-4000-8000-000000000091",
        profile_id: "10000000-0000-4000-8000-000000000001",
        role: "owner",
      },
      {
        company_id: "10000000-0000-4000-8000-000000000010",
        email: "owner.harbour@clean-app.example.test",
        full_name: "Harbour Demo Owner",
        joined_at: "2026-08-02T00:00:00+10:00",
        membership_id: "10000000-0000-4000-8000-000000000093",
        profile_id: "10000000-0000-4000-8000-000000000006",
        role: "staff",
      },
    ]));
    mocks.getCompanyLogoUrl.mockResolvedValue(null);

    render(await SettingsPage());

    const employees = screen.getByRole("region", { name: "Employees" });
    expect(within(employees).getByText("Demo Company Admin")).toBeInTheDocument();
    expect(within(employees).getByText("admin@clean-app.example.test")).toBeInTheDocument();
    expect(within(employees).getByText("Joined 1 Aug 2026")).toBeInTheDocument();
    expect(within(employees).getByRole("combobox", {
      name: "Role for Harbour Demo Owner",
    })).toHaveValue("staff");
    expect(mocks.from).toHaveBeenCalledWith("employee_membership_details");
  });
});
