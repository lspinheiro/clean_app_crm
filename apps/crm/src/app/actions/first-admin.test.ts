import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  cookies: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { initialFirstAdminState } from "@/features/first-admin/state";

import { acceptFirstAdminAction } from "./first-admin";

function validFormData() {
  const formData = new FormData();
  formData.set("abn", "53 004 085 616");
  formData.set("companyName", "New Coast Cleaning");
  formData.set("confirmPassword", "safe-local-password");
  formData.set("fullName", "Ana Admin");
  formData.set("locale", "pt-BR");
  formData.set("password", "safe-local-password");
  formData.set("phone", "0412 345 678");
  return formData;
}

describe("acceptFirstAdminAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ set: mocks.cookieSet });
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "admin@example.test", id: "user-1" } },
      error: null,
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: [
          {
            expires_at: "2026-08-18T02:00:00.000Z",
            invitation_status: "pending",
            invitee_email: "admin@example.test",
            locale: "en-AU",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: "company-1", error: null });
    mocks.updateUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
      rpc: mocks.rpc,
    });
  });

  it("validates every field before it creates a Supabase client", async () => {
    await expect(
      acceptFirstAdminAction(initialFirstAdminState, new FormData()),
    ).resolves.toMatchObject({
      fieldErrors: {
        abn: expect.any(String),
        companyName: expect.any(String),
        confirmPassword: expect.any(String),
        fullName: expect.any(String),
        locale: expect.any(String),
        password: expect.any(String),
        phone: expect.any(String),
      },
    });

    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("sets the password, accepts through the RPC, and redirects through onboarding", async () => {
    await expect(
      acceptFirstAdminAction(initialFirstAdminState, validFormData()),
    ).rejects.toThrow("NEXT_REDIRECT:/pt-BR/onboarding");

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "get_first_admin_invitation_context");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "safe-local-password" });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "accept_first_admin_invitation", {
      company_abn: "53004085616",
      company_name: "New Coast Cleaning",
      contact_phone: "0412 345 678",
      full_name: "Ana Admin",
      target_locale: "pt-BR",
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith("NEXT_LOCALE", "pt-BR", {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  });

  it("does not change the password when the caller has no pending invitation", async () => {
    mocks.rpc.mockReset().mockResolvedValueOnce({
      data: [
        {
          expires_at: null,
          invitation_status: "expired",
          invitee_email: "admin@example.test",
          locale: "en-AU",
        },
      ],
      error: null,
    });

    await expect(
      acceptFirstAdminAction(initialFirstAdminState, validFormData()),
    ).resolves.toMatchObject({ formError: expect.any(String) });

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns a safe password error when Supabase rejects the password", async () => {
    mocks.updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "raw Auth detail" },
    });

    await expect(
      acceptFirstAdminAction(initialFirstAdminState, validFormData()),
    ).resolves.toMatchObject({
      fieldErrors: { password: expect.any(String) },
      formError: null,
    });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("does not expose an RPC error or redirect when atomic acceptance fails", async () => {
    mocks.rpc
      .mockReset()
      .mockResolvedValueOnce({
        data: [
          {
            expires_at: "2026-08-18T02:00:00.000Z",
            invitation_status: "pending",
            invitee_email: "admin@example.test",
            locale: "en-AU",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "raw database detail" } });

    await expect(
      acceptFirstAdminAction(initialFirstAdminState, validFormData()),
    ).resolves.toMatchObject({ formError: expect.any(String) });

    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
