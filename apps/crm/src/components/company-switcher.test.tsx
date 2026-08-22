import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanySwitcher } from "./company-switcher";

const { mockUseFormStatus } = vi.hoisted(() => ({
  mockUseFormStatus: vi.fn(),
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return { ...actual, useFormStatus: mockUseFormStatus };
});

const memberships = [
  { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" as const },
  { companyId: "company-2", companyName: "Harbour Demo Cleaning", role: "staff" as const },
];

function renderSwitcher() {
  return render(
    <CompanySwitcher
      activeCompanyId="company-1"
      activeCompanyName="Coastal Demo Cleaning"
      activeLogoUrl={null}
      memberships={memberships}
    />,
  );
}

describe("CompanySwitcher", () => {
  beforeEach(() => {
    mockUseFormStatus.mockReturnValue({ pending: false });
  });

  it("marks the active company, lists roles, and always offers company creation", () => {
    renderSwitcher();

    fireEvent.click(screen.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    }));

    expect(screen.getByText("Current company", { exact: true })).toBeVisible();
    const companyGroup = screen.getByRole("group", { name: "Your companies" });
    expect(within(companyGroup).getByText("Coastal Demo Cleaning", { exact: true }).closest("[aria-current]"))
      .toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", {
      description: "Staff",
      name: "Switch to Harbour Demo Cleaning",
    })).toBeInTheDocument();
    expect(screen.getByText("Owner", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Staff", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create new company" }))
      .toHaveAttribute("href", "/companies/new");
    expect(screen.queryByText("All companies")).not.toBeInTheDocument();
  });

  it("closes on outside press or Escape and restores focus", () => {
    renderSwitcher();

    const trigger = screen.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    });
    const menu = trigger.closest("details");
    fireEvent.click(trigger);
    expect(menu).toHaveAttribute("open");

    fireEvent.pointerDown(document.body);
    expect(menu).not.toHaveAttribute("open");

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("opens with ArrowDown and supports menu-key focus movement", () => {
    renderSwitcher();

    const trigger = screen.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const switchTarget = screen.getByRole("button", {
      name: "Switch to Harbour Demo Cleaning",
    });
    expect(switchTarget).toHaveFocus();

    fireEvent.keyDown(switchTarget, { key: "End" });
    expect(screen.getByRole("link", { name: "Create new company" })).toHaveFocus();

    fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
    expect(switchTarget).toHaveFocus();
  });

  it("stays available during switching and closes after the active company changes", () => {
    const { rerender } = renderSwitcher();
    const trigger = screen.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    });
    const menu = trigger.closest("details");

    fireEvent.click(trigger);
    expect(menu).toHaveAttribute("open");

    rerender(
      <CompanySwitcher
        activeCompanyId="company-2"
        activeCompanyName="Harbour Demo Cleaning"
        activeLogoUrl={null}
        memberships={memberships}
      />,
    );

    expect(menu).not.toHaveAttribute("open");
  });

  it("announces and disables a company switch while it is pending", () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    renderSwitcher();

    const switchTarget = screen.getByRole("button", {
      name: "Switch to Harbour Demo Cleaning",
    });
    expect(switchTarget).toBeDisabled();
    expect(switchTarget).toHaveAttribute("aria-busy", "true");
    expect(within(switchTarget).getByRole("status")).toHaveTextContent("Switching…");
  });
});
