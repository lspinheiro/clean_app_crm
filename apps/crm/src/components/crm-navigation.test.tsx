import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CrmNavigation } from "./crm-navigation";

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}));

const expectedLinks = [
  ["Roster", "/roster"],
  ["Jobs", "/jobs"],
  ["Clients", "/clients"],
  ["Staff", "/cleaners"],
  ["Money", "/money"],
] as const;

describe("CLE-5 CRM shell navigation", () => {
  beforeEach(() => {
    cleanup();
    mockUsePathname.mockReturnValue("/roster");
  });

  it("renders the five milestone shell destinations once", () => {
    render(<CrmNavigation />);

    for (const [label, href] of expectedLinks) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", href);
    }
  });

  it.each([
    ["Roster", "/roster"],
    ["Jobs", "/jobs/job-1"],
    ["Clients", "/clients/client-1"],
    ["Staff", "/cleaners"],
    ["Money", "/money"],
  ])("marks %s as current throughout its route section", (label, pathname) => {
    mockUsePathname.mockReturnValue(pathname);
    render(<CrmNavigation />);

    expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    for (const otherLabel of expectedLinks.map(([name]) => name).filter((name) => name !== label)) {
      expect(screen.getByRole("link", { name: otherLabel })).not.toHaveAttribute("aria-current");
    }
  });
});
