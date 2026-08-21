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
    mocks.changeEmployeeRoleAction.mockResolvedValue({ ok: true });
    mocks.removeEmployeeAction.mockResolvedValue({ ok: true });
  });

  it("shows each employee's name, e-mail, role, and Brisbane joined date", () => {
    render(<EmployeeManagement employees={employees} />);

    const list = screen.getByLabelText("Current employees");
    const owner = within(list).getByRole("group", { name: "CLE-84 Owner One" });
    expect(within(owner).getByText("owner.one.cle84@clean-app.example.test"))
      .toBeInTheDocument();
    expect(within(owner).getByText("Joined 10 Aug 2026")).toBeInTheDocument();
    expect(within(owner).getByRole("combobox", { name: "Role for CLE-84 Owner One" }))
      .toHaveValue("owner");
  });

  it("submits a validated role choice and announces success", async () => {
    const user = userEvent.setup();
    render(<EmployeeManagement employees={employees} />);
    const staff = screen.getByRole("group", { name: "CLE-84 Staff" });

    await user.selectOptions(
      within(staff).getByRole("combobox", { name: "Role for CLE-84 Staff" }),
      "owner",
    );
    await user.click(within(staff).getByRole("button", { name: "Save role for CLE-84 Staff" }));

    await waitFor(() => expect(mocks.changeEmployeeRoleAction).toHaveBeenCalledWith({
      membershipId: "10000000-0000-4000-8000-000000000096",
      role: "owner",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Employee role updated.");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("announces the last-owner refusal and keeps the row available", async () => {
    mocks.removeEmployeeAction.mockResolvedValue({
      formError: "user.lastCompanyOwnerRequired",
      ok: false,
    });
    const user = userEvent.setup();
    render(<EmployeeManagement employees={employees.slice(0, 1)} />);
    const owner = screen.getByRole("group", { name: "CLE-84 Owner One" });

    await user.click(within(owner).getByRole("button", { name: "Remove CLE-84 Owner One" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This company must keep at least one owner.",
    );
    expect(screen.getByRole("group", { name: "CLE-84 Owner One" })).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
