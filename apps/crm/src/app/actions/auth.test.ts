import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieDelete: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  createClient: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  rpc: vi.fn(),
  select: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { signInAction } from "./auth";

describe("signInAction locale persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      delete: mocks.cookieDelete,
      get: mocks.cookieGet,
      set: mocks.cookieSet,
    });
    mocks.cookieGet.mockReturnValue({ value: "en-AU" });
    mocks.maybeSingle
      .mockResolvedValueOnce({
        data: { id: "user-1", preferred_locale: "en-AU" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          company_id: "company-1",
          profile_id: "user-1",
          role: "owner",
          status: "active",
        },
        error: null,
      });
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      order: mocks.order,
      limit: mocks.limit,
      maybeSingle: mocks.maybeSingle,
    };
    mocks.eq.mockReturnValue(query);
    mocks.order.mockReturnValue(query);
    mocks.limit.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        signOut: mocks.signOut,
      },
      from: mocks.from,
      rpc: mocks.rpc,
    });
  });

  it("keeps the saved profile preference authoritative across sign-ins", async () => {
    mocks.cookieGet.mockReturnValue({ value: "pt-BR" });
    const formData = new FormData();
    formData.set("email", "admin@example.com");
    formData.set("password", "local-demo-only");

    await expect(signInAction({ error: null, fieldErrors: {} }, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/en-AU/roster",
    );

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledWith("employee_memberships");
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
    expect(mocks.cookieSet).toHaveBeenCalledWith("NEXT_LOCALE", "en-AU", {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  });

  it("returns field-associated errors for every invalid credential field", async () => {
    const formData = new FormData();

    await expect(signInAction({ error: null, fieldErrors: {} }, formData)).resolves.toEqual({
      error: null,
      fieldErrors: {
        email: "Enter a valid email address.",
        password: "Enter your password.",
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("keeps a membership-less account signed in and sends it to the no-access screen", async () => {
    mocks.maybeSingle
      .mockReset()
      .mockResolvedValueOnce({
        data: { id: "user-1", preferred_locale: "en-AU" },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set("email", "cleaner@example.com");
    formData.set("password", "local-demo-only");

    await expect(signInAction({ error: null, fieldErrors: {} }, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/en-AU/no-company-access",
    );

    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
