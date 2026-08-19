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
    render(<CrmHeader companyName="Coastal Demo Cleaning" employeeRole="owner" logoUrl={null} />);

    expect(screen.queryByText("+ New job")).not.toBeInTheDocument();
  });

  it("marks company settings as current on settings routes", () => {
    mockUsePathname.mockReturnValue("/settings/identity");
    render(<CrmHeader companyName="Coastal Demo Cleaning" employeeRole="owner" logoUrl={null} />);

    expect(screen.getByRole("link", { name: "Company settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not offer owner settings to staff", () => {
    render(<CrmHeader companyName="Coastal Demo Cleaning" employeeRole="staff" logoUrl={null} />);

    expect(screen.queryByRole("link", { name: "Company settings" })).not.toBeInTheDocument();
  });

});
