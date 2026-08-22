import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CleanerIntlProvider } from "@/i18n/provider";

const mocks = vi.hoisted(() => ({
  useCleaner: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock("@/lib/auth/use-cleaner", () => ({ useCleaner: mocks.useCleaner }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: mocks.usePathname,
}));

import CleanerLayout from "./layout";

function renderLayout(locale: "en-AU" | "pt-BR" = "en-AU") {
  return render(
    <CleanerIntlProvider initialLocale={locale}>
      <CleanerLayout>{null}</CleanerLayout>
    </CleanerIntlProvider>,
  );
}

afterEach(() => {
  delete (globalThis as { __CLEANER_TEST_LOCALE__?: string }).__CLEANER_TEST_LOCALE__;
});

beforeEach(() => {
  mocks.useCleaner.mockReturnValue({
    status: "allowed",
    profile: { id: "cleaner-1", full_name: "Ana Souza", suburb: "Robina" },
  });
  mocks.usePathname.mockReturnValue("/en-AU/board");
});

describe("CLE-24 the cleaner app has two places to be", () => {
  it("offers both tabs to a signed-in cleaner", () => {
    renderLayout();

    const board = screen.getByRole("link", { name: "Open jobs" });
    const myJobs = screen.getByRole("link", { name: "My jobs" });

    expect(board).toHaveAttribute(
      "href",
      "/en-AU/board",
    );
    expect(myJobs).toHaveAttribute(
      "href",
      "/en-AU/my-jobs",
    );
    expect(board.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(myJobs.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Language" })).toBeInTheDocument();
  });

  it("marks the tab she is on so she can tell where she is", () => {
    mocks.usePathname.mockReturnValue("/en-AU/my-jobs");
    renderLayout();

    expect(screen.getByRole("link", { name: "My jobs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Open jobs" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows no tabs at all while the gate is still deciding", () => {
    mocks.useCleaner.mockReturnValue({ status: "checking" });
    renderLayout();

    expect(screen.queryByRole("link", { name: "Open jobs" })).not.toBeInTheDocument();
  });

  it("localises the signed-in navigation without changing its destinations", () => {
    (globalThis as { __CLEANER_TEST_LOCALE__?: string }).__CLEANER_TEST_LOCALE__ = "pt-BR";
    mocks.usePathname.mockReturnValue("/pt-BR/board");
    renderLayout("pt-BR");

    expect(screen.getByRole("link", { name: "Serviços disponíveis" })).toHaveAttribute(
      "href",
      "/pt-BR/board",
    );
    expect(screen.getByRole("link", { name: "Meus serviços" })).toHaveAttribute(
      "href",
      "/pt-BR/my-jobs",
    );
    expect(screen.getByRole("combobox", { name: "Idioma" })).toHaveValue("pt-BR");
  });
});
