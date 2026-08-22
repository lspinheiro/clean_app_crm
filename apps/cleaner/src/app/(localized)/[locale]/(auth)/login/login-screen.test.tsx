import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CleanerIntlProvider, useCleanerLocale } from "@/i18n/provider";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  membership: { data: { profile_id: "cleaner-1", status: "active" }, error: null },
  profile: { data: { id: "cleaner-1", preferred_locale: "pt-BR" }, error: null },
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
    <CleanerIntlProvider initialLocale="en-AU">
      <LocaleAwareLogin />
    </CleanerIntlProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Digite um endereço de e-mail válido.",
    );
    expect(screen.getByLabelText("E-mail")).toHaveValue("not-an-email");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("keeps the saved profile preference authoritative after sign in", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "cleaner@example.test");
    await user.type(screen.getByLabelText("Password"), "local-demo-only");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/pt-BR/board"));
    const profile = mocks.from.mock.results.find(
      (result) => result.type === "return" && result.value.maybeSingle,
    )?.value;
    expect(profile.select).toHaveBeenCalledWith("id, preferred_locale");
    expect(mocks.rpc).not.toHaveBeenCalledWith("set_preferred_locale", {
      target_locale: "en-AU",
    });
  });
});
