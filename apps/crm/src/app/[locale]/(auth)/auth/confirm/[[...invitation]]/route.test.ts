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
      { params: Promise.resolve({ invitation: undefined, locale: "en-AU" }) },
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "safe-hash", type: "invite" });
    expect(response.headers.get("location")).toBe("/en-AU/invite/accept");
  });

  // The identifier rode in a query string until 2026-08-27. That forced the employee branch
  // of the invite template to join with `&` while the founder branch used `?`, and when Auth
  // refused the redirect and substituted `site_url` the link reached the invitee as
  // `https://cleaner.thecleancrew.app&token_hash=…` — no path, no `?`, wrong app. A redirect
  // that carries no query cannot be malformed that way, and both templates now join with `?`.
  it("preserves an employee invitation identifier carried in the path", async () => {
    const response = await GET(
      new NextRequest(
        "https://crm.example.test/en-AU/auth/confirm/83000000-0000-4000-8000-000000000101?token_hash=safe-hash&type=invite",
      ),
      {
        params: Promise.resolve({
          invitation: ["83000000-0000-4000-8000-000000000101"],
          locale: "en-AU",
        }),
      },
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "safe-hash", type: "invite" });
    expect(response.headers.get("location")).toBe(
      "/en-AU/invite/accept?employeeInvitation=83000000-0000-4000-8000-000000000101",
    );
  });

  it("ignores a path segment that is not an invitation identifier", async () => {
    const response = await GET(
      new NextRequest(
        "https://crm.example.test/en-AU/auth/confirm/not-an-id?token_hash=safe-hash&type=invite",
      ),
      { params: Promise.resolve({ invitation: ["not-an-id"], locale: "en-AU" }) },
    );

    // The first-admin acceptance page is the safe destination; a bad segment must not be
    // reflected back into the redirect.
    expect(response.headers.get("location")).toBe("/en-AU/invite/accept");
  });

  it("exchanges a recovery token for a renewed first-admin invitation", async () => {
    const response = await GET(
      new NextRequest("https://crm.example.test/pt-BR/auth/confirm?token_hash=safe-hash&type=recovery"),
      { params: Promise.resolve({ invitation: undefined, locale: "pt-BR" }) },
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "safe-hash", type: "recovery" });
    expect(response.headers.get("location")).toBe("/pt-BR/invite/accept");
  });

  it("keeps the browser on its incoming origin after setting the Auth session", async () => {
    const response = await GET(
      new NextRequest("http://127.0.0.1:3000/pt-BR/auth/confirm?token_hash=safe-hash&type=recovery"),
      { params: Promise.resolve({ invitation: undefined, locale: "pt-BR" }) },
    );

    expect(response.headers.get("location")).toBe("/pt-BR/invite/accept");
  });

  it("does not exchange another token type", async () => {
    const response = await GET(
      new NextRequest("https://crm.example.test/pt-BR/auth/confirm?token_hash=safe-hash&type=magiclink"),
      { params: Promise.resolve({ invitation: undefined, locale: "pt-BR" }) },
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
      { params: Promise.resolve({ invitation: undefined, locale: "en-AU" }) },
    );

    expect(response.headers.get("location")).toBe(
      "/en-AU/invite/accept?error=invalid",
    );
  });
});
