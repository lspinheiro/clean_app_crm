import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CrmHeader } from "./crm-header";

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}));

describe("CrmHeader", () => {
  beforeEach(() => {
    cleanup();
    mockUsePathname.mockReturnValue("/roster");
  });

  it("does not advertise job creation before the workflow ships", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        employeeRole="owner"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    expect(screen.queryByText("+ New job")).not.toBeInTheDocument();
  });

  it("marks company settings as current on settings routes", () => {
    mockUsePathname.mockReturnValue("/settings/identity");
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        employeeRole="owner"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    expect(screen.getByRole("link", { name: "Company settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not offer owner settings to staff", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        employeeRole="staff"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "staff" },
        ]}
        profileName="Taylor Staff"
      />,
    );

    expect(screen.queryByRole("link", { name: "Company settings" })).not.toBeInTheDocument();
  });

  it("offers company switching only when the account has multiple memberships", () => {
    const { rerender } = render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        employeeRole="owner"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
          { companyId: "company-2", companyName: "Harbour Demo Cleaning", role: "staff" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Switch company" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to Harbour Demo Cleaning" }))
      .toBeInTheDocument();

    rerender(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        employeeRole="owner"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    expect(screen.queryByRole("group", { name: "Switch company" })).not.toBeInTheDocument();
  });

});
