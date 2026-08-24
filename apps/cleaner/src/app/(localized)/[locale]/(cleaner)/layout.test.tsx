import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CleanerIntlProvider } from "@/i18n/provider";
import { cleanerTestMessages } from "@/test/render";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  signOut: vi.fn(),
  useCleaner: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock("@/lib/auth/use-cleaner", () => ({ useCleaner: mocks.useCleaner }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: mocks.usePathname,
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { signOut: mocks.signOut } }),
}));

import CleanerLayout from "./layout";

function renderLayout(locale: "en-AU" | "pt-BR" = "en-AU") {
  return render(
    <CleanerIntlProvider initialLocale={locale} initialMessages={cleanerTestMessages[locale]}>
      <CleanerLayout>{null}</CleanerLayout>
    </CleanerIntlProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.useCleaner.mockReturnValue({
    status: "allowed",
    profile: { id: "cleaner-1", full_name: "Ana Souza", suburb: "Robina" },
  });
  mocks.usePathname.mockReturnValue("/en-AU/board");
});

describe("CLE-26 the cleaner app navigation", () => {
  it("offers the board, jobs, and profile tabs to a signed-in cleaner", () => {
    renderLayout();

    const board = screen.getByRole("link", { name: "Open jobs" });
    const myJobs = screen.getByRole("link", { name: "My jobs" });
    const profile = screen.getByRole("link", { name: "Profile" });

    expect(board).toHaveAttribute(
      "href",
      "/en-AU/board",
    );
    expect(myJobs).toHaveAttribute(
      "href",
      "/en-AU/my-jobs",
    );
    expect(profile).toHaveAttribute("href", "/en-AU/profile");
    expect(board.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(myJobs.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(profile.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
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
    expect(screen.getByRole("link", { name: "Perfil" })).toHaveAttribute(
      "href",
      "/pt-BR/profile",
    );
    expect(screen.getByRole("combobox", { name: "Idioma" })).toHaveValue("pt-BR");
  });

  it("recovers the sign-out control and reports a failed sign out", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockResolvedValue({ error: new Error("network unavailable") });
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't sign you out. Try again.",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("also recovers when sign out throws a transport exception", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockRejectedValue(new TypeError("offline"));
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't sign you out. Try again.",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
});
