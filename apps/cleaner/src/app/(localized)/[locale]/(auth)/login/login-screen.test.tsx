import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CleanerIntlProvider, useCleanerLocale } from "@/i18n/provider";
import { cleanerTestMessages } from "@/test/render";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  membership: { data: { profile_id: "cleaner-1", status: "active" }, error: null as Error | null },
  profile: { data: { id: "cleaner-1", preferred_locale: "pt-BR" }, error: null as Error | null },
  replace: vi.fn(),
  rpc: vi.fn(),
  searchParams: new URLSearchParams(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

import { LoginScreen } from "./login-screen";

function profileQuery(result: typeof mocks.profile | typeof mocks.membership) {
  const query = {
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    select: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function renderLogin() {
  function LocaleAwareLogin() {
    const { locale } = useCleanerLocale();
    return <div data-locale={locale}><LoginScreen /></div>;
  }

  return render(
    <CleanerIntlProvider initialLocale="en-AU" initialMessages={cleanerTestMessages["en-AU"]}>
      <LocaleAwareLogin />
    </CleanerIntlProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
  mocks.profile.error = null;
  mocks.profile.data.preferred_locale = "pt-BR";
  mocks.membership.error = null;
  document.documentElement.lang = "en-AU";
  window.history.replaceState({}, "", "/en-AU/login");
  mocks.searchParams = new URLSearchParams();
  mocks.signInWithPassword.mockResolvedValue({
    data: { user: { id: "cleaner-1" } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) =>
    table === "profiles" ? profileQuery(mocks.profile) : profileQuery(mocks.membership),
  );
});

describe("Cleaner sign in language behavior", () => {
  it("uses localized application validation instead of browser-owned copy", () => {
    const { container } = renderLogin();

    expect(container.querySelector("form")).toHaveAttribute("novalidate");
  });

  it("retranslates a visible validation error when language changes", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Digite um endereço de e-mail válido.",
      ),
    );
    expect(screen.getByLabelText("E-mail")).toHaveValue("not-an-email");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("persists the language explicitly selected on the sign-in screen", async () => {
    const user = userEvent.setup();
    mocks.profile.data.preferred_locale = "en-AU";
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "cleaner@example.test");
    await user.type(screen.getByLabelText("Password"), "local-demo-only");
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/pt-BR/board"));
    const profile = mocks.from.mock.results.find(
      (result) => result.type === "return" && result.value.maybeSingle,
    )?.value;
    expect(profile.select).toHaveBeenCalledWith("id, preferred_locale");
    expect(mocks.rpc).toHaveBeenCalledWith("set_preferred_locale", {
      target_locale: "pt-BR",
    });
  });

  it("does not overwrite a preference or grant access when the profile read fails", async () => {
    const user = userEvent.setup();
    mocks.profile.error = new Error("profile unavailable");
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "cleaner@example.test");
    await user.type(screen.getByLabelText("Password"), "local-demo-only");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not grant cleaner access when the membership read fails", async () => {
    const user = userEvent.setup();
    mocks.membership.error = new Error("membership unavailable");
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "cleaner@example.test");
    await user.type(screen.getByLabelText("Password"), "local-demo-only");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("finishes sign in when saving the selected locale fails", async () => {
    const user = userEvent.setup();
    document.cookie = "NEXT_LOCALE=en-AU; path=/";
    mocks.rpc.mockResolvedValue({ error: new Error("preference unavailable") });
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "cleaner@example.test");
    await user.type(screen.getByLabelText("Password"), "local-demo-only");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/en-AU/board"));
  });
});
