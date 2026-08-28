import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestEmployeeInvitationLinkAction: vi.fn(),
}));

vi.mock("@/app/actions/employee-invitations", () => ({
  requestEmployeeInvitationLinkAction: mocks.requestEmployeeInvitationLinkAction,
}));

import { RequestNewLink } from "./request-new-link";

const INVITATION_ID = "83000000-0000-4000-8000-000000000101";

function renderLink() {
  return render(
    <RequestNewLink invitationId={INVITATION_ID} inviteeHint="a***@example.test" />,
  );
}

// CLE-99. The failed state was written and no path reached it: the action answers `ok` for
// every outcome it can see, so the only failure left is the request never completing — and
// that arrived as a rejected promise nothing caught, leaving the button on "Sending…".
describe("RequestNewLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });

  it("shows the failure when the request itself never completes", async () => {
    mocks.requestEmployeeInvitationLinkAction.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderLink();

    await user.click(screen.getByRole("button", { name: "Send me a new link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not complete that request. Check your connection and try again.",
    );
    // The request is the thing that failed, so pressing again is the whole of what is left.
    expect(screen.getByRole("button", { name: "Send me a new link" })).toBeEnabled();
  });

  it("shows that failure in Brazilian Portuguese too", async () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";
    mocks.requestEmployeeInvitationLinkAction.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderLink();

    await user.click(screen.getByRole("button", { name: "Enviar um novo link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível concluir a solicitação. Verifique sua conexão e tente novamente.",
    );
  });

  it("says nothing about the invitation when the request does complete", async () => {
    // The action deliberately answers the same way whether or not an e-mail went out, so
    // that holding a link id cannot be used to discover which invitations are live. An
    // answered request must therefore never reach the failure state.
    mocks.requestEmployeeInvitationLinkAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderLink();

    await user.click(screen.getByRole("button", { name: "Send me a new link" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Check your inbox/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
