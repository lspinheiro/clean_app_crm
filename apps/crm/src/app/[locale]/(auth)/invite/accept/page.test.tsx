import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  continueConfirmation: vi.fn(),
  cookieGet: vi.fn(),
  cookies: vi.fn(),
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
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/app/actions/auth-confirmation", () => ({
  continuePendingConfirmationAction: mocks.continueConfirmation,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  usePathname: () => "/en-AU/invite/accept",
}));

import FirstAdminAcceptancePage from "./page";

/**
 * What the confirmation route leaves behind for a person to spend. Absent by default: most of
 * these journeys are somebody arriving without one.
 */
function parkToken(value?: string) {
  mocks.cookieGet.mockImplementation((name: string) =>
    name === "crm_pending_confirmation" && value !== undefined ? { name, value } : undefined,
  );
}

describe("first-admin acceptance page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
    parkToken();
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

  it("offers the same continuation to an unauthenticated visitor whatever the address", async () => {
    // This used to send an address that already had an account to the sign-in page, which
    // disclosed account existence to anyone holding the link. One neutral screen now; the
    // returnTo contract it exercised is still covered by actions/auth.test.ts.
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === "employee_invitation_preview"
          ? {
            data: [{
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

    expect(screen.getByRole("button", { name: "Send me a new link" })).toBeInTheDocument();
    // Sign-in is offered to everybody rather than withheld. Showing it only to addresses
    // that already had an account was the disclosure; showing it to nobody would strand
    // somebody who knows their password behind a recovery e-mail they do not need.
    expect(screen.getByRole("link", { name: "Sign in" }))
      .toHaveAttribute(
        "href",
        `/login?returnTo=%2Finvite%2Faccept%3FemployeeInvitation%3D83000000-0000-4000-8000-000000000101`,
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
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
    parkToken();
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

  it("offers one continuation to anyone arriving without a session", async () => {
    // The page used to branch on whether the address already had an account, which let
    // anyone holding the link test that. One neutral continuation for everybody: the server
    // decides whether to re-invite or send a recovery e-mail, and never says which.
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.rpc.mockImplementation(routeRpc({ preview: previewRow() }));

    render(await renderAccept());

    expect(screen.getByRole("heading", { name: "Open your invitation" }))
      .toBeInTheDocument();
    expect(screen.getByText(/Coastal Demo Cleaning/)).toBeInTheDocument();
    // Naming the problem is not enough — the seven-day invitation has to stay reachable
    // without an admin, or this is a politer dead end.
    expect(screen.getByRole("button", { name: "Send me a new link" })).toBeInTheDocument();
  });

  it("renders the same screen whoever the invitee is", async () => {
    // Two invitations that differ only in whether the address already had an account must be
    // indistinguishable from outside.
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.rpc.mockImplementation(routeRpc({ preview: previewRow() }));
    const { container: first } = render(await renderAccept());
    const firstHtml = first.innerHTML;

    cleanup();
    mocks.rpc.mockImplementation(
      routeRpc({ preview: previewRow({ invitee_hint: "a***@example.test" }) }),
    );
    const { container: second } = render(await renderAccept());

    expect(second.innerHTML).toBe(firstHtml);
  });

  it.each([
    ["expired", "This invitation has expired"],
    ["revoked", "This invitation was withdrawn"],
    // CLE-97: a replaced invitation used to be folded into "withdrawn" here and into
    // "Expired" on the owner's list. Neither is the advice this holder needs — a newer
    // invitation is already in their inbox.
    ["replaced", "This invitation was replaced"],
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
    // CLE-101. The offered role arrives with the same sentence the inviter chose it by.
    expect(screen.getByText(
      "Staff can manage their own settings and run day-to-day work, but cannot edit company "
      + "details or manage employees.",
    )).toBeInTheDocument();
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

  // The link no longer spends itself, so an unspent token is the ordinary case: the invitee
  // has arrived and nothing has happened yet. Offering "send me a new link" here would ask
  // somebody holding a perfectly good token to wait for another e-mail.
  it("offers Continue to a visitor whose token is still unspent", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.rpc.mockImplementation(routeRpc({ preview: previewRow() }));
    parkToken("invite:safe-hash");

    render(await renderAccept());

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByText(/Coastal Demo Cleaning/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send me a new link" }))
      .not.toBeInTheDocument();
  });

  // Exchanging the token replaces whoever is signed in with the invitee, which is what the
  // founder asked for after opening an invitee's link on a machine already signed in as
  // somebody else: detect it, drop it, carry on — without a separate sign-out step.
  it("offers Continue rather than a sign-out when the wrong account holds an unspent token", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "owner@example.test", id: "owner-1" } },
      error: null,
    });
    mocks.rpc.mockImplementation(routeRpc({ preview: previewRow() }));
    parkToken("invite:safe-hash");

    render(await renderAccept());

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it.each([
    ["expired", "This invitation has expired"],
    ["revoked", "This invitation was withdrawn"],
    ["replaced", "This invitation was replaced"],
  ])("does not offer Continue for a %s invitation", async (state, heading) => {
    // The preview is read before anything is spent, so a token parked against a dead
    // invitation is simply never exchanged.
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.rpc.mockImplementation(
      routeRpc({
        preview: previewRow({ state, company_name: null, invitee_hint: null, role: null }),
      }),
    );
    parkToken("invite:safe-hash");

    render(await renderAccept());

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("falls back to a new link once the parked token is gone", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.rpc.mockImplementation(routeRpc({ preview: previewRow() }));
    parkToken();

    render(await renderAccept());

    expect(screen.getByRole("heading", { name: "Open your invitation" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send me a new link" })).toBeInTheDocument();
  });
});

// The founder invitation shares the confirmation route, so it inherits both the problem and
// the fix. It has no invitation id and no session, so it cannot name the company — but
// "press Continue" is still the whole of what the reader has to do.
describe("first-admin invitation with a parked confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });

  it("offers Continue instead of an unavailable invitation", async () => {
    parkToken("invite:safe-hash");

    render(
      await FirstAdminAcceptancePage({ searchParams: Promise.resolve({ error: "invalid" }) }),
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps the unavailable state when nothing is parked", async () => {
    parkToken();

    render(await FirstAdminAcceptancePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "This invitation is not available" }))
      .toBeInTheDocument();
  });
});

// CLE-99. The confirmation route marks a link that carried no usable token — truncated in
// transit, or opened without one — and the page read the marker's absence as easily as its
// presence, which is to say not at all. The reader was left with a screen that never named
// the thing they had just done.
describe("a confirmation link that carried no usable token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
    parkToken();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  });

  afterEach(() => {
    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });

  it("names the broken link on the employee invitation screen", async () => {
    mocks.rpc.mockImplementation(routeRpc({ preview: previewRow() }));

    render(
      await FirstAdminAcceptancePage({
        searchParams: Promise.resolve({
          employeeInvitation: INVITATION_ID,
          error: "invalid",
        }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "That link did not work. Open the link in your e-mail again, or send yourself a new one.",
    );
    // Naming it is only half of it — the remedy has to still be on the screen.
    expect(screen.getByRole("button", { name: "Send me a new link" })).toBeInTheDocument();
  });

  it("names the broken link in Brazilian Portuguese", async () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";
    mocks.rpc.mockImplementation(routeRpc({ preview: previewRow() }));

    render(
      await FirstAdminAcceptancePage({
        searchParams: Promise.resolve({
          employeeInvitation: INVITATION_ID,
          error: "invalid",
        }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Esse link não funcionou. Abra o link do seu e-mail novamente ou envie um novo para você.",
    );
  });

  it("names the broken link on the founder invitation screen", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    render(
      await FirstAdminAcceptancePage({ searchParams: Promise.resolve({ error: "invalid" }) }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "That link did not work. Open the link in your e-mail again, or ask the founding team for a new one.",
    );
  });

  it("stays quiet about the link while a parked token still works", async () => {
    // The marker describes the fetch that carried no token, not the one already parked from
    // an earlier hop. Pressing Continue is still the whole of what this reader has to do, so
    // announcing a broken link here would be false.
    mocks.rpc.mockImplementation(routeRpc({ preview: previewRow() }));
    parkToken("invite:safe-hash");

    render(
      await FirstAdminAcceptancePage({
        searchParams: Promise.resolve({
          employeeInvitation: INVITATION_ID,
          error: "invalid",
        }),
      }),
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
