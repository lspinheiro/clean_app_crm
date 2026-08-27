import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  refresh: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  usePathname: () => "/en-AU/invite/accept",
}));

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
      if (name === "employee_invitation_preview") {
        return Promise.resolve({
          data: [{
            account_existed: true,
            company_name: "Coastal Demo Cleaning",
            invitee_hint: "c***@example.test",
            role: "staff",
            state: "pending",
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
    mocks.rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === "employee_invitation_preview"
          ? {
            data: [{
              account_existed: true,
              company_name: "Coastal Demo Cleaning",
              invitee_hint: "c***@example.test",
              role: "staff",
              state: "pending",
            }],
            error: null,
          }
          : { data: [], error: null },
      ),
    );

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

// An invitation that cannot be acted on is worse than one that fails: three separate people
// hit dead ends this week. `get_employee_invitation_context` returns zero rows for "not
// signed in", "signed in as somebody else", "revoked" and "expired" alike, so the page could
// not tell them apart. `employee_invitation_preview` answers without a session, which is what
// lets each state name itself.

const INVITATION_ID = "83000000-0000-4000-8000-000000000101";

type PreviewRow = {
  account_existed: boolean | null;
  company_name: string | null;
  invitee_hint: string | null;
  role: string | null;
  state: string;
};

type ContextRow = {
  account_existed_at_invitation: boolean;
  company_name: string;
  invitation_id: string;
  invitation_status: string;
  invitee_email: string;
  locale: string;
  role: string;
};

function previewRow(overrides: Partial<PreviewRow> = {}): PreviewRow {
  return {
    account_existed: false,
    company_name: "Coastal Demo Cleaning",
    invitee_hint: "a***@example.test",
    role: "staff",
    state: "pending",
    ...overrides,
  };
}

/** Routes the two RPCs the employee branch now uses. */
function routeRpc(
  { preview, context = null }: { context?: ContextRow | null; preview: PreviewRow },
) {
  return (name: string) =>
    name === "employee_invitation_preview"
      ? Promise.resolve({ data: [preview], error: null })
      : Promise.resolve({ data: context ? [context] : [], error: null });
}

function renderAccept() {
  return FirstAdminAcceptancePage({
    searchParams: Promise.resolve({ employeeInvitation: INVITATION_ID }),
  });
}

describe("employee invitation states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  });

  it("names both accounts when the visitor is signed in as somebody else", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "owner@example.test", id: "owner-1" } },
      error: null,
    });
    mocks.rpc.mockImplementation(routeRpc({ preview: previewRow() }));

    render(await renderAccept());

    expect(screen.getByRole("heading", { name: "You're signed in as a different account" }))
      .toBeInTheDocument();
    // Both halves must appear, or the reader cannot tell what to change.
    expect(screen.getByText(/a\*\*\*@example\.test/)).toBeInTheDocument();
    expect(screen.getByText(/owner@example\.test/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use another account" })).toBeInTheDocument();
  });

  it("tells a brand-new invitee the link was already opened instead of asking them to sign in", async () => {
    // The CRM has no sign-up, no magic link and no password reset, so "Sign in" is a dead end
    // for an account whose password was generated and never shown to anyone.
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.rpc.mockImplementation(
      routeRpc({ preview: previewRow({ account_existed: false }) }),
    );

    render(await renderAccept());

    expect(screen.getByRole("heading", { name: "This link has already been opened" }))
      .toBeInTheDocument();
    expect(screen.getByText(/Coastal Demo Cleaning/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    // Naming the problem is not enough — the seven-day invitation has to stay reachable
    // without an admin, or this is a politer dead end.
    expect(screen.getByRole("button", { name: "Send me a new link" })).toBeInTheDocument();
  });

  it("still asks an existing account to sign in, which is the one case that works", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.rpc.mockImplementation(
      routeRpc({ preview: previewRow({ account_existed: true }) }),
    );

    render(await renderAccept());

    expect(screen.getByRole("heading", { name: "Sign in to accept your invitation" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" }))
      .toHaveAttribute(
        "href",
        `/login?returnTo=%2Finvite%2Faccept%3FemployeeInvitation%3D${INVITATION_ID}`,
      );
  });

  it.each([
    ["expired", "This invitation has expired"],
    ["revoked", "This invitation was withdrawn"],
    ["accepted", "This invitation was already accepted"],
    ["unknown", "We could not find this invitation"],
  ])("says exactly what happened when the invitation is %s", async (state, heading) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.rpc.mockImplementation(
      routeRpc({
        preview: previewRow({ state, company_name: null, invitee_hint: null, role: null }),
      }),
    );

    render(await renderAccept());

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("does not ask the database who the caller is for a dead invitation", async () => {
    // The state is the same for everyone, so a terminal invitation costs one round trip.
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "owner@example.test", id: "owner-1" } },
      error: null,
    });
    mocks.rpc.mockImplementation(routeRpc({ preview: previewRow({ state: "revoked" }) }));

    render(await renderAccept());

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("employee_invitation_preview", {
      target_invitation_id: INVITATION_ID,
    });
  });

  it("shows the acceptance form when the signed-in account is the invitee", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "invitee@example.test", id: "invitee-1" } },
      error: null,
    });
    mocks.rpc.mockImplementation(
      routeRpc({
        preview: previewRow(),
        context: {
          account_existed_at_invitation: true,
          company_name: "Coastal Demo Cleaning",
          invitation_id: INVITATION_ID,
          invitation_status: "pending",
          invitee_email: "invitee@example.test",
          locale: "en-AU",
          role: "staff",
        },
      }),
    );

    render(await renderAccept());

    expect(screen.getByRole("heading", { name: "Join Coastal Demo Cleaning" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeInTheDocument();
  });

  it("does not claim a wrong account when the addresses agree but the context refuses", async () => {
    // Masking collapses distinct addresses, and the context RPC also refuses an unconfirmed
    // e-mail. Claiming "you are signed in as somebody else" would then be a lie.
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "alex@example.test", id: "alex-1" } },
      error: null,
    });
    mocks.rpc.mockImplementation(
      routeRpc({ preview: previewRow({ invitee_hint: "a***@example.test" }) }),
    );

    render(await renderAccept());

    expect(
      screen.getByRole("heading", { name: "We could not open this invitation for your account" }),
    ).toBeInTheDocument();
  });
});
