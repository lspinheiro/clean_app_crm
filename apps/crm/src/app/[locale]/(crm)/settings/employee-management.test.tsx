import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changeEmployeeRoleAction: vi.fn(),
  refresh: vi.fn(),
  removeEmployeeAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/employee-management", () => ({
  changeEmployeeRoleAction: mocks.changeEmployeeRoleAction,
  removeEmployeeAction: mocks.removeEmployeeAction,
}));

import { EmployeeManagement } from "./employee-management";

const employees = [
  {
    email: "owner.one.cle84@clean-app.example.test",
    fullName: "CLE-84 Owner One",
    joinedAt: "2026-08-10T00:00:00+10:00",
    membershipId: "10000000-0000-4000-8000-000000000094",
    profileId: "10000000-0000-4000-8000-000000000008",
    role: "owner" as const,
  },
  {
    email: "staff.cle84@clean-app.example.test",
    fullName: "CLE-84 Staff",
    joinedAt: "2026-08-12T00:00:00+10:00",
    membershipId: "10000000-0000-4000-8000-000000000096",
    profileId: "10000000-0000-4000-8000-000000000010",
    role: "staff" as const,
  },
];

describe("CLE-84 employee management controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    });
    mocks.changeEmployeeRoleAction.mockResolvedValue({ ok: true });
    mocks.removeEmployeeAction.mockResolvedValue({ ok: true });
  });

  it("shows each employee's identity, company access, joined date, and current-user context", () => {
    render(
      <EmployeeManagement
        currentProfileId="10000000-0000-4000-8000-000000000008"
        employees={employees}
      />,
    );

    const list = screen.getByLabelText("Current employees");
    const owner = within(list).getByRole("group", { name: "CLE-84 Owner One" });
    expect(within(owner).getByText("owner.one.cle84@clean-app.example.test"))
      .toBeInTheDocument();
    expect(within(owner).getByText("Joined 10 Aug 2026")).toBeInTheDocument();
    expect(within(owner).getByText("You")).toBeInTheDocument();
    expect(within(owner).getByRole("combobox", { name: "Company access for CLE-84 Owner One" }))
      .toHaveValue("owner");
    expect(within(owner).getByText(
      "Can edit company details, manage employees and run day-to-day work.",
    ))
      .toBeInTheDocument();
  });

  it("confirms owner promotion, submits the change, and keeps feedback in the affected row", async () => {
    const user = userEvent.setup();
    render(
      <EmployeeManagement
        currentProfileId="10000000-0000-4000-8000-000000000008"
        employees={employees}
      />,
    );
    const staff = screen.getByRole("group", { name: "CLE-84 Staff" });

    await user.selectOptions(
      within(staff).getByRole("combobox", { name: "Company access for CLE-84 Staff" }),
      "owner",
    );
    await user.click(within(staff).getByRole("button", {
      name: "Save company access for CLE-84 Staff",
    }));

    expect(mocks.changeEmployeeRoleAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Give CLE-84 Staff owner access?" });
    expect(within(dialog).getByText(
      "Owners can edit company details and manage employees and other owners.",
    )).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Give owner access" }));

    await waitFor(() => expect(mocks.changeEmployeeRoleAction).toHaveBeenCalledWith({
      membershipId: "10000000-0000-4000-8000-000000000096",
      role: "owner",
    }));
    expect(await within(staff).findByRole("status")).toHaveTextContent(
      "CLE-84 Staff now has Owner access.",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("protects the last owner before a destructive request can be sent", async () => {
    const user = userEvent.setup();
    render(
      <EmployeeManagement
        currentProfileId="10000000-0000-4000-8000-000000000008"
        employees={employees.slice(0, 1)}
      />,
    );
    const owner = screen.getByRole("group", { name: "CLE-84 Owner One" });
    const removeButton = within(owner).getByRole("button", {
      name: "Remove company access for CLE-84 Owner One",
    });

    expect(removeButton).toBeDisabled();
    expect(within(owner).getByText(
      "Assign another owner before changing or removing this access.",
    )).toBeInTheDocument();

    await user.selectOptions(
      within(owner).getByRole("combobox", { name: "Company access for CLE-84 Owner One" }),
      "staff",
    );

    expect(within(owner).getByRole("button", {
      name: "Save company access for CLE-84 Owner One",
    })).toBeDisabled();
    expect(mocks.changeEmployeeRoleAction).not.toHaveBeenCalled();
    expect(mocks.removeEmployeeAction).not.toHaveBeenCalled();
  });

  it("names the consequence before removing access", async () => {
    const user = userEvent.setup();
    render(
      <EmployeeManagement
        currentProfileId="10000000-0000-4000-8000-000000000008"
        employees={employees}
      />,
    );
    const staff = screen.getByRole("group", { name: "CLE-84 Staff" });

    await user.click(within(staff).getByRole("button", {
      name: "Remove company access for CLE-84 Staff",
    }));

    expect(mocks.removeEmployeeAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Remove CLE-84 Staff’s company access?" });
    expect(within(dialog).getByText(
      "They will lose access to this company immediately. Their account and company history will be kept.",
    )).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remove access" }));

    await waitFor(() => expect(mocks.removeEmployeeAction).toHaveBeenCalledWith({
      membershipId: "10000000-0000-4000-8000-000000000096",
    }));
    expect(await within(staff).findByRole("status")).toHaveTextContent(
      "CLE-84 Staff’s company access was removed.",
    );
  });
});
