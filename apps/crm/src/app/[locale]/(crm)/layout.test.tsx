import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCompanyLogoUrl: vi.fn(),
  requireCompanyAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));

vi.mock("@/lib/company-logo", () => ({
  getCompanyLogoUrl: mocks.getCompanyLogoUrl,
}));

import CrmLayout from "./layout";

describe("CRM layout accessibility", () => {
  it("puts the skip link before the site header and targets main content", async () => {
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { name: "Coastal Demo Cleaning", logo_path: null },
      membership: { role: "owner" },
      supabase: {},
    });
    mocks.getCompanyLogoUrl.mockResolvedValue(null);

    const { container } = render(await CrmLayout({ children: <p>Roster content</p> }));
    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    const header = container.querySelector("header");

    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(skipLink.compareDocumentPosition(header as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(document.querySelector("#main-content")).toHaveAttribute("tabindex", "-1");
  });
});
