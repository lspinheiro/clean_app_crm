import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/pool", () => ({
  rotatePoolInvite: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { PoolWorkspace } from "./pool-workspace";

const baseProps = {
  cleanerAppUrl: "https://cleaner.example.test",
  companyName: "Coastal Demo Cleaning",
  members: [],
};

afterEach(() => {
  delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
});

describe("CLE-78 WhatsApp pool invitation", () => {
  it("keeps WhatsApp sharing unavailable without an active invite", () => {
    render(<PoolWorkspace {...baseProps} initialCode={null} />);

    expect(
      screen.getByRole("button", { name: "Share on WhatsApp" }),
    ).toBeDisabled();
  });

  it.each([
    {
      expectedMessage:
        "Join Coastal Demo Cleaning's cleaner pool: https://cleaner.example.test/join?code=AB12CD\nInvite code: AB12CD",
      label: "Share on WhatsApp",
      locale: "en-AU",
    },
    {
      expectedMessage:
        "Entre para o banco de profissionais da empresa Coastal Demo Cleaning: https://cleaner.example.test/join?code=AB12CD\nCódigo de convite: AB12CD",
      label: "Compartilhar no WhatsApp",
      locale: "pt-BR",
    },
  ])("opens the localized $locale message from an explicit click", ({
    expectedMessage,
    label,
    locale,
  }) => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = locale;
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<PoolWorkspace {...baseProps} initialCode="AB12CD" />);

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(openWindow).toHaveBeenCalledOnce();
    const [rawUrl, target, features] = openWindow.mock.calls[0];
    const shareUrl = new URL(String(rawUrl));
    expect(`${shareUrl.origin}${shareUrl.pathname}`).toBe("https://wa.me/");
    expect(shareUrl.searchParams.get("text")).toBe(expectedMessage);
    expect(target).toBe("_blank");
    expect(features).toBe("noopener,noreferrer");
  });
});
