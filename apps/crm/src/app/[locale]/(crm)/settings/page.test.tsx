import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCompanyLogoUrl: vi.fn(),
  requireCompanyOwner: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyOwner: mocks.requireCompanyOwner,
}));

vi.mock("@/lib/company-logo", () => ({
  getCompanyLogoUrl: mocks.getCompanyLogoUrl,
}));

import SettingsPage from "./page";

afterEach(cleanup);

describe("company settings language control", () => {
  it("offers both alpha languages without translating their names", async () => {
    mocks.requireCompanyOwner.mockResolvedValue({
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

  it("reports the saved profile preference instead of the bookmarked route locale", async () => {
    mocks.requireCompanyOwner.mockResolvedValue({
      company: {
        abn: "53004085616",
        logo_path: null,
        name: "Coastal Demo Cleaning",
        timezone: "Australia/Brisbane",
      },
      profile: { preferred_locale: "pt-BR" },
      supabase: {},
    });
    mocks.getCompanyLogoUrl.mockResolvedValue(null);

    render(await SettingsPage());

    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("pt-BR");
  });
});
