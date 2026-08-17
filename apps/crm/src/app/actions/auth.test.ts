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
  rpc: vi.fn(),
  select: vi.fn(),
  signInWithPassword: vi.fn(),
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
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "user-1", preferred_locale: "en-AU", role: "company_admin" },
      error: null,
    });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
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
});
