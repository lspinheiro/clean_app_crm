import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CleanerIntlProvider } from "@/i18n/provider";
import { cleanerTestMessages } from "@/test/render";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  profile: {
    data: {
      full_name: "Ana Souza",
      phone: "0400000000",
      preferred_locale: "pt-BR",
      suburb: "Robina",
    },
    error: null,
  },
  replace: vi.fn(),
  rpc: vi.fn(),
  searchParams: new URLSearchParams("code=CLEAN1"),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mocks.getUser,
      signOut: mocks.signOut,
      signUp: mocks.signUp,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

import { JoinScreen } from "./join-screen";

function renderJoin() {
  return render(
    <CleanerIntlProvider initialLocale="en-AU" initialMessages={cleanerTestMessages["en-AU"]}>
      <JoinScreen />
    </CleanerIntlProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
  document.documentElement.lang = "en-AU";
  window.history.replaceState({}, "", "/en-AU/join?code=CLEAN1");
  mocks.searchParams = new URLSearchParams("code=CLEAN1");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "cleaner-1", email: "ana@example.test" } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.from.mockImplementation(() => {
    const query = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue(mocks.profile),
      select: vi.fn(),
    };
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    return query;
  });
  mocks.rpc.mockImplementation((name: string) => {
    if (name === "cleaner_invite_preview") {
      return Promise.resolve({
        data: [{ company_name: "Coastal Demo Cleaning", pool_size: 1, state: "active" }],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
});

describe("Cleaner join language behavior", () => {
  it("uses localized application validation on both join forms", async () => {
    const { container } = renderJoin();

    await screen.findByRole("button", { name: "Join the Cleaner staff" });
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
  });

  it("persists the language explicitly selected for an existing account", async () => {
    const user = userEvent.setup();
    renderJoin();

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Language" }),
      "pt-BR",
    );
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Idioma" }),
      "en-AU",
    );
    await user.click(await screen.findByRole("button", { name: "Join the Cleaner staff" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/en-AU/board"));
    expect(mocks.rpc).toHaveBeenCalledWith("set_preferred_locale", {
      target_locale: "en-AU",
    });
  });

  it("finishes joining when saving the selected locale fails", async () => {
    const user = userEvent.setup();
    document.cookie = "NEXT_LOCALE=en-AU; path=/";
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "cleaner_invite_preview") {
        return Promise.resolve({
          data: [{ company_name: "Coastal Demo Cleaning", pool_size: 1, state: "active" }],
          error: null,
        });
      }
      if (name === "set_preferred_locale") {
        return Promise.resolve({ data: null, error: new Error("preference unavailable") });
      }
      return Promise.resolve({ data: null, error: null });
    });
    renderJoin();

    await user.click(await screen.findByRole("button", { name: "Join the Cleaner staff" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/en-AU/board"));
  });

  it("persists an authenticated language choice while the invite is still loading", async () => {
    const user = userEvent.setup();
    const preview = new Promise(() => undefined);
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "cleaner_invite_preview") return preview;
      return Promise.resolve({ data: null, error: null });
    });
    renderJoin();
    await waitFor(() => expect(mocks.from).toHaveBeenCalled());

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("set_preferred_locale", {
        target_locale: "pt-BR",
      }),
    );
  });
});
