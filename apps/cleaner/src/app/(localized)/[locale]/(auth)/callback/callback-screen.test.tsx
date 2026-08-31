import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CleanerIntlProvider } from "@/i18n/provider";
import { cleanerTestMessages } from "@/test/render";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getSession: mocks.getSession,
    },
  }),
}));

import { CallbackScreen } from "./callback-screen";

function renderCallback() {
  return render(
    <CleanerIntlProvider initialLocale="en-AU" initialMessages={cleanerTestMessages["en-AU"]}>
      <CallbackScreen />
    </CleanerIntlProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams("code=oauth-code&next=%2Fen-AU%2Fjoin%3Fcode%3DCLEAN1");
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.exchangeCodeForSession.mockResolvedValue({
    data: { session: { access_token: "session" } },
    error: null,
  });
});

describe("Google authentication callback", () => {
  it("exchanges the auth code and returns to the preserved posting", async () => {
    renderCallback();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/en-AU/join?code=CLEAN1"));
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
  });

  it("uses an already-detected session without exchanging the code twice", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "existing-session" } },
      error: null,
    });
    renderCallback();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/en-AU/join?code=CLEAN1"));
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("refuses an external return URL", async () => {
    mocks.searchParams = new URLSearchParams(
      "code=oauth-code&next=https%3A%2F%2Fevil.example%2Fsteal",
    );
    renderCallback();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/en-AU/login"));
  });

  it("shows a visible recovery state when authentication cannot finish", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: "expired code" },
    });
    renderCallback();

    expect(await screen.findByRole("alert")).toHaveTextContent("could not finish Google sign-in");
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
