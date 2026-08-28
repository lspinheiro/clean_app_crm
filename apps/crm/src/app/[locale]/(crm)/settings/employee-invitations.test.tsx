import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inviteEmployeeAction: vi.fn(),
  refresh: vi.fn(),
  revokeEmployeeInvitationAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/employee-invitations", () => ({
  inviteEmployeeAction: mocks.inviteEmployeeAction,
  revokeEmployeeInvitationAction: mocks.revokeEmployeeInvitationAction,
}));

import { EmployeeInvitations } from "./employee-invitations";

const openInvitation = {
  createdAt: "2026-08-28T00:00:00+10:00",
  email: "new.employee@example.test",
  id: "83000000-0000-4000-8000-000000000101",
  role: "staff" as const,
  state: "pending" as const,
};

async function sendInvitation() {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Email"),
    "new.employee@example.test",
  );
  await user.click(screen.getByRole("button", { name: "Send invitation" }));
}

describe("CLE-95 invitation delivery failures stay visible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inviteEmployeeAction.mockResolvedValue({ ok: true });
    mocks.revokeEmployeeInvitationAction.mockResolvedValue({ ok: true });
  });

  // A rejected send that could not be withdrawn leaves the invitation pending. Telling the
  // owner to "check the address and try again" points them at a second attempt the database
  // refuses, because the first invitation is still holding the address.
  it("names the open invitation and reloads the list when a rejected send is not withdrawn", async () => {
    mocks.inviteEmployeeAction.mockResolvedValue({
      fieldErrors: {},
      formError: "user.employeeInvitationDeliveryFailedStillOpen",
      ok: false,
    });
    render(<EmployeeInvitations invitations={[openInvitation]} />);

    await sendInvitation();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The invitation could not be delivered and is still open. Revoke it in the list below, then check the address and send it again.",
    );
    // Server state moved: the list was drawn before this invitation existed.
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    // And the owner has the control the message just told them to use.
    const list = screen.getByLabelText("Employee invitations");
    const row = within(list).getByText("new.employee@example.test").closest("article");
    expect(within(row as HTMLElement).getByText("Pending")).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByRole("button", { name: "Revoke new.employee@example.test" }),
    ).toBeInTheDocument();
  });

  it("reloads the list when a rejected send was withdrawn, so the row is no longer open", async () => {
    mocks.inviteEmployeeAction.mockResolvedValue({
      fieldErrors: {},
      formError: "user.employeeInvitationDeliveryFailed",
      ok: false,
    });
    render(<EmployeeInvitations invitations={[]} />);

    await sendInvitation();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The invitation could not be delivered. Check the address and try again.",
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(screen.getByText("No employee invitations yet.")).toBeInTheDocument();
  });

  it("tells a Brazilian owner the invitation is still open, in Portuguese", async () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";
    mocks.inviteEmployeeAction.mockResolvedValue({
      fieldErrors: {},
      formError: "user.employeeInvitationDeliveryFailedStillOpen",
      ok: false,
    });
    render(<EmployeeInvitations invitations={[openInvitation]} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "new.employee@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível enviar o convite, e ele continua aberto. Revogue-o na lista abaixo, confira o endereço e envie novamente.",
    );
    expect(
      screen.getByRole("button", { name: "Revogar convite de new.employee@example.test" }),
    ).toBeInTheDocument();

    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });

  // A rejected field never reached the database, so there is nothing new to read back.
  it("does not reload the list when the address itself was rejected", async () => {
    mocks.inviteEmployeeAction.mockResolvedValue({
      fieldErrors: { email: "user.employeeEmailInvalid" },
      formError: null,
      ok: false,
    });
    render(<EmployeeInvitations invitations={[]} />);

    await sendInvitation();

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
