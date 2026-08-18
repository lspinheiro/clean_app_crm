import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET } from "./route";

describe("first-admin Auth confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "session" } }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp: mocks.verifyOtp } });
  });

  it("exchanges only an invite token hash and continues to the locale acceptance page", async () => {
    const response = await GET(
      new NextRequest("https://crm.example.test/en-AU/auth/confirm?token_hash=safe-hash&type=invite"),
      { params: Promise.resolve({ locale: "en-AU" }) },
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "safe-hash", type: "invite" });
    expect(response.headers.get("location")).toBe("/en-AU/invite/accept");
  });

  it("exchanges a recovery token for a renewed first-admin invitation", async () => {
    const response = await GET(
      new NextRequest("https://crm.example.test/pt-BR/auth/confirm?token_hash=safe-hash&type=recovery"),
      { params: Promise.resolve({ locale: "pt-BR" }) },
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "safe-hash", type: "recovery" });
    expect(response.headers.get("location")).toBe("/pt-BR/invite/accept");
  });

  it("keeps the browser on its incoming origin after setting the Auth session", async () => {
    const response = await GET(
      new NextRequest("http://127.0.0.1:3000/pt-BR/auth/confirm?token_hash=safe-hash&type=recovery"),
      { params: Promise.resolve({ locale: "pt-BR" }) },
    );

    expect(response.headers.get("location")).toBe("/pt-BR/invite/accept");
  });

  it("does not exchange another token type", async () => {
    const response = await GET(
      new NextRequest("https://crm.example.test/pt-BR/auth/confirm?token_hash=safe-hash&type=magiclink"),
      { params: Promise.resolve({ locale: "pt-BR" }) },
    );

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "/pt-BR/invite/accept?error=invalid",
    );
  });

  it("maps a failed token exchange to the same safe unavailable state", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "raw detail" } });

    const response = await GET(
      new NextRequest("https://crm.example.test/en-AU/auth/confirm?token_hash=bad-hash&type=invite"),
      { params: Promise.resolve({ locale: "en-AU" }) },
    );

    expect(response.headers.get("location")).toBe(
      "/en-AU/invite/accept?error=invalid",
    );
  });
});
