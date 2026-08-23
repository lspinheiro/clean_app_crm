import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { getUser: mocks.getUser } }),
}));

import { LegacyLocaleRedirect } from "./legacy-locale-redirect";

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "NEXT_LOCALE=pt-BR; path=/";
  window.history.replaceState({}, "", "/join?code=CLEAN1#error=denied");
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe("legacy cleaner route localisation", () => {
  it("renders a branded loading surface and preserves query plus hash", async () => {
    render(<LegacyLocaleRedirect pathname="/join" />);

    expect(screen.getByRole("main", { name: "The Clean Crew" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/pt-BR/join?code=CLEAN1#error=denied",
      ),
    );
  });
});
