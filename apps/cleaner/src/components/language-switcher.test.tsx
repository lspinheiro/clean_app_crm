import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CleanerIntlProvider } from "@/i18n/provider";
import { DocumentMetadata } from "@/i18n/document-metadata";
import { cleanerTestMessages } from "@/test/render";

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
}));

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { LanguageSwitcher } from "./language-switcher";

beforeEach(() => {
  mocks.rpc.mockResolvedValue({ error: null });
  window.history.replaceState({}, "", "/en-AU/join?code=CLEAN1");
  document.documentElement.lang = "en-AU";
});

describe("Cleaner language switching", () => {
  it("changes the canonical locale in place without losing the current task", async () => {
    const user = userEvent.setup();
    render(
      <CleanerIntlProvider initialLocale="en-AU" initialMessages={cleanerTestMessages["en-AU"]}>
        <DocumentMetadata />
        <LanguageSwitcher />
        <label htmlFor="full-name">Full name</label>
        <input id="full-name" defaultValue="Ana Souza" />
      </CleanerIntlProvider>,
    );

    await user.clear(screen.getByLabelText("Full name"));
    await user.type(screen.getByLabelText("Full name"), "Ana da Silva");
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");

    await waitFor(() => expect(window.location.pathname).toBe("/pt-BR/join"));
    expect(window.location.search).toBe("?code=CLEAN1");
    expect(document.documentElement.lang).toBe("pt-BR");
    await waitFor(() =>
      expect(document.title).toBe("Entrar em uma empresa · The Clean Crew"),
    );
    expect(screen.getByLabelText("Full name")).toHaveValue("Ana da Silva");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("persists an authenticated choice before changing the interface", async () => {
    const user = userEvent.setup();
    render(
      <CleanerIntlProvider initialLocale="en-AU" initialMessages={cleanerTestMessages["en-AU"]}>
        <DocumentMetadata />
        <LanguageSwitcher authenticated />
      </CleanerIntlProvider>,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("set_preferred_locale", {
        target_locale: "pt-BR",
      }),
    );
    expect(window.location.pathname).toBe("/pt-BR/join");
  });
});
