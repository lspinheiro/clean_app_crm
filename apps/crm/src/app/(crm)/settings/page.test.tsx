import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCompanyLogoUrl: vi.fn(),
  requireCompanyAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));

vi.mock("@/lib/company-logo", () => ({
  getCompanyLogoUrl: mocks.getCompanyLogoUrl,
}));

import SettingsPage from "./page";

describe("company settings language control", () => {
  it("offers both alpha languages without translating their names", async () => {
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: {
        abn: "53004085616",
        logo_path: null,
        name: "Coastal Demo Cleaning",
        timezone: "Australia/Brisbane",
      },
      profile: { preferred_locale: "en-AU" },
      supabase: {},
    });
    mocks.getCompanyLogoUrl.mockResolvedValue(null);

    render(await SettingsPage());

    expect(screen.getByRole("combobox", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "English (Australia)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Português (Brasil)" })).toBeInTheDocument();
  });
});
