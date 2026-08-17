import { beforeEach, describe, expect, it, vi } from "vitest";

import { explicitLocaleCookieName } from "@/i18n/config";

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

  it("consumes an explicit pre-auth choice that already matches the saved preference", async () => {
    const formData = new FormData();
    formData.set("email", "admin@example.com");
    formData.set("password", "local-demo-only");

    await expect(signInAction({ error: null }, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/en-AU/roster",
    );

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.cookieDelete).toHaveBeenCalledWith(explicitLocaleCookieName);
    expect(mocks.cookieSet).toHaveBeenCalledWith("NEXT_LOCALE", "en-AU", {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  });

  it("saves and consumes a different explicit pre-auth choice", async () => {
    mocks.cookieGet.mockReturnValue({ value: "pt-BR" });
    mocks.rpc.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set("email", "admin@example.com");
    formData.set("password", "local-demo-only");

    await expect(signInAction({ error: null }, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/pt-BR/roster",
    );

    expect(mocks.rpc).toHaveBeenCalledWith("set_preferred_locale", {
      target_locale: "pt-BR",
    });
    expect(mocks.cookieDelete).toHaveBeenCalledWith(explicitLocaleCookieName);
  });

  it("retains a different explicit choice when persistence fails", async () => {
    mocks.cookieGet.mockReturnValue({ value: "pt-BR" });
    mocks.rpc.mockResolvedValue({ error: new Error("save failed") });
    const formData = new FormData();
    formData.set("email", "admin@example.com");
    formData.set("password", "local-demo-only");

    await expect(signInAction({ error: null }, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/pt-BR/roster",
    );

    expect(mocks.cookieDelete).not.toHaveBeenCalled();
  });
});
