import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import FirstAdminAcceptancePage from "./page";

describe("first-admin acceptance page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "admin@example.test", id: "user-1" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          expires_at: "2026-08-18T02:00:00.000Z",
          invitation_status: "pending",
          invitee_email: "admin@example.test",
          locale: "pt-BR",
        },
      ],
      error: null,
    });
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  });

  it("is public and shows a safe unavailable state without a verified invite session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    render(
      await FirstAdminAcceptancePage({
        searchParams: Promise.resolve({ error: "invalid" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "This invitation is not available" }))
      .toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows the form only for the caller's pending application invitation", async () => {
    render(
      await FirstAdminAcceptancePage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "Create your company account" }))
      .toBeInTheDocument();
    expect(screen.getByText("admin@example.test")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("get_first_admin_invitation_context");
  });

  it("recovers a pending invitation when a reused confirmation link leaves a stale error marker", async () => {
    render(
      await FirstAdminAcceptancePage({
        searchParams: Promise.resolve({ error: "invalid" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Create your company account" }))
      .toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("get_first_admin_invitation_context");
  });

  it("shows the same unavailable state for an expired application invitation", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          expires_at: "2026-08-18T00:00:00.000Z",
          invitation_status: "expired",
          invitee_email: "admin@example.test",
          locale: "en-AU",
        },
      ],
      error: null,
    });

    render(
      await FirstAdminAcceptancePage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "This invitation is not available" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create company account" }))
      .not.toBeInTheDocument();
  });

  it("offers one-login acceptance to an existing account with an employee invitation", async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_employee_invitation_context") {
        return Promise.resolve({
          data: [{
            account_existed_at_invitation: true,
            company_name: "Coastal Demo Cleaning",
            invitation_id: "83000000-0000-4000-8000-000000000101",
            invitation_status: "pending",
            invitee_email: "cleaner@example.test",
            locale: "en-AU",
            role: "staff",
          }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    render(
      await FirstAdminAcceptancePage({
        searchParams: Promise.resolve({
          employeeInvitation: "83000000-0000-4000-8000-000000000101",
        }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Join Coastal Demo Cleaning" }))
      .toBeInTheDocument();
    expect(screen.getByText("Staff", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("get_employee_invitation_context", {
      target_invitation_id: "83000000-0000-4000-8000-000000000101",
    });
  });

  it("asks an unauthenticated existing account to sign in and preserves the invitation target", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    render(
      await FirstAdminAcceptancePage({
        searchParams: Promise.resolve({
          employeeInvitation: "83000000-0000-4000-8000-000000000101",
        }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Sign in to accept your invitation" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Finvite%2Faccept%3FemployeeInvitation%3D83000000-0000-4000-8000-000000000101",
    );
  });
});
