import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    expect(screen.queryByText("+ New job")).not.toBeInTheDocument();
  });

  it("keeps product identity and current company as separate header controls", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    expect(screen.getByRole("link", { name: "The Clean Crew home" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Current company: Coastal Demo Cleaning" }),
    ).toBeInTheDocument();
  });

  it("offers owner settings inside the account menu and marks it current", () => {
    mockUsePathname.mockReturnValue("/settings/identity");
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Account menu" });
    fireEvent.click(trigger);
    const accountMenu = trigger.closest("details");

    expect(within(accountMenu as HTMLElement).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getAllByRole("link", { name: "Settings" })).toHaveLength(1);
    expect(screen.queryByLabelText("Company settings")).not.toBeInTheDocument();
  });

  it("offers personal settings to staff", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "staff" },
        ]}
        profileName="Taylor Staff"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("closes the account menu on outside press or Escape", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Account menu" });
    const menu = trigger.closest("details");
    fireEvent.click(trigger);
    expect(menu).toHaveAttribute("open");

    fireEvent.pointerDown(document.body);

    expect(menu).not.toHaveAttribute("open");

    fireEvent.click(trigger);
    expect(menu).toHaveAttribute("open");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(menu).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("always exposes company context and creation outside the personal account menu", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    const companyTrigger = screen.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    });
    fireEvent.click(companyTrigger);
    expect(screen.getByRole("link", { name: "Create new company" })).toBeInTheDocument();
    expect(screen.queryByText("All companies")).not.toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    const accountTrigger = screen.getByRole("button", { name: "Account menu" });
    fireEvent.click(accountTrigger);
    const accountMenu = accountTrigger.closest("details");
    expect(accountMenu).not.toBeNull();
    expect(within(accountMenu as HTMLElement).queryByRole("group", { name: "Switch company" }))
      .not.toBeInTheDocument();
    expect(within(accountMenu as HTMLElement).queryByRole("link", { name: "Create new company" }))
      .not.toBeInTheDocument();
  });

  it("lists every active membership and its role in the company selector", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
          { companyId: "company-2", companyName: "Harbour Demo Cleaning", role: "staff" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    }));
    const companyGroup = screen.getByRole("group", { name: "Your companies" });
    expect(within(companyGroup).getByText("Coastal Demo Cleaning", { exact: true }))
      .toBeInTheDocument();
    expect(within(companyGroup).getByText("Harbour Demo Cleaning", { exact: true }))
      .toBeInTheDocument();
    expect(within(companyGroup).getByText("Owner", { exact: true })).toBeInTheDocument();
    expect(within(companyGroup).getByText("Staff", { exact: true })).toBeInTheDocument();
  });

});
