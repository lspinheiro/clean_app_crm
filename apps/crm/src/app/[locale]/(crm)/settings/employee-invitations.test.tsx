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

const OWNER_LINE =
  "Owners can edit company details, invite and manage employees, and run day-to-day work.";
const STAFF_LINE =
  "Staff can manage their own settings and run day-to-day work, but cannot edit company "
  + "details or manage employees.";

async function chooseRole(role: "owner" | "staff") {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Company access"), role);
  return user;
}

describe("CLE-101 roles are explained where they are granted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    });
    mocks.inviteEmployeeAction.mockResolvedValue({ ok: true });
    mocks.revokeEmployeeInvitationAction.mockResolvedValue({ ok: true });
  });

  // The choice used to be two words with no consequence attached, so the inviter had to know
  // the permission model already to make it.
  it("says what each role can do beside the choice", () => {
    render(<EmployeeInvitations invitations={[]} />);

    const help = document.getElementById("employee-invitation-access-help");
    expect(help).not.toBeNull();
    expect(within(help as HTMLElement).getByText(OWNER_LINE)).toBeInTheDocument();
    expect(within(help as HTMLElement).getByText(STAFF_LINE)).toBeInTheDocument();
    expect(screen.getByLabelText("Company access")).toHaveAttribute(
      "aria-describedby",
      "employee-invitation-access-help",
    );
  });

  // An owner grant hands the company over, and a sent invitation cannot be un-sent.
  it("asks once before an owner invitation is sent, then sends it", async () => {
    render(<EmployeeInvitations invitations={[]} />);
    const user = await chooseRole("owner");
    await user.type(screen.getByLabelText("Email"), "new.owner@example.test");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(mocks.inviteEmployeeAction).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", {
      name: "Invite new.owner@example.test as an owner?",
    });
    expect(within(dialog).getByText(
      "Owner access hands over full control of the company: company details, employees and "
      + "invitations. You can revoke the invitation before it is accepted, but the e-mail "
      + "cannot be un-sent.",
    )).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Send owner invitation" }));

    await waitFor(() => expect(mocks.inviteEmployeeAction).toHaveBeenCalledTimes(1));
    const formData = mocks.inviteEmployeeAction.mock.calls[0][0] as FormData;
    expect(formData.get("role")).toBe("owner");
    expect(formData.get("email")).toBe("new.owner@example.test");
  });

  it("sends nothing when the owner confirmation is cancelled", async () => {
    render(<EmployeeInvitations invitations={[]} />);
    const user = await chooseRole("owner");
    await user.type(screen.getByLabelText("Email"), "new.owner@example.test");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.inviteEmployeeAction).not.toHaveBeenCalled();
  });

  // Staff grants nothing to hand over, so the extra step would only be in the way.
  it("sends a staff invitation without asking", async () => {
    render(<EmployeeInvitations invitations={[]} />);
    const user = await chooseRole("staff");
    await user.type(screen.getByLabelText("Email"), "new.employee@example.test");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(mocks.inviteEmployeeAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains the roles and asks about owner access in Portuguese", async () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";
    render(<EmployeeInvitations invitations={[]} />);

    expect(screen.getByText(
      "Proprietários podem editar os dados da empresa, convidar e gerenciar funcionários e "
      + "cuidar do trabalho diário.",
    )).toBeInTheDocument();
    expect(screen.getByText(
      "Funcionários podem gerenciar as próprias configurações e cuidar do trabalho diário, "
      + "mas não podem editar os dados da empresa nem gerenciar funcionários.",
    )).toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Acesso à empresa"), "owner");
    await user.type(screen.getByLabelText("E-mail"), "novo.proprietario@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Convidar novo.proprietario@example.test como proprietário?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Enviar convite de proprietário" }),
    );
    await waitFor(() => expect(mocks.inviteEmployeeAction).toHaveBeenCalledTimes(1));

    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });
});
