import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET } from "./route";

/** The wire name the acceptance page and the continuation action both read. */
const pendingCookie = "crm_pending_confirmation";

describe("first-admin Auth confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "session" } }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp: mocks.verifyOtp } });
  });

  // Until 2026-08-28 this route called `verifyOtp` on the GET, so fetching the URL spent the
  // single-use token and confirmed the account. An Outlook or Mimecast scanner, a corporate
  // mail gateway, a prefetch or a reload all fetch it, which is how three people reached a
  // dead end on one invitation. A GET must not mutate; the invitee presses Continue.
  it("does not spend the token while the link is being fetched", async () => {
    const response = await GET(
      new NextRequest("https://crm.example.test/en-AU/auth/confirm?token_hash=safe-hash&type=invite"),
      { params: Promise.resolve({ invitation: undefined, locale: "en-AU" }) },
    );

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/en-AU/invite/accept");
  });

  it("parks the token for a human to spend", async () => {
    const response = await GET(
      new NextRequest("https://crm.example.test/en-AU/auth/confirm?token_hash=safe-hash&type=invite"),
      { params: Promise.resolve({ invitation: undefined, locale: "en-AU" }) },
    );

    expect(response.cookies.get(pendingCookie)?.value).toBe("invite:safe-hash");
    const header = response.headers.get("set-cookie") ?? "";
    // Out of reach of scripts, and not sent on a cross-site POST — the exchange is a same-site
    // server action and nothing else should be able to trigger it.
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=lax");
    expect(header).toContain("Path=/");
  });

  it("parks a recovery token the same way", async () => {
    const response = await GET(
      new NextRequest("https://crm.example.test/pt-BR/auth/confirm?token_hash=safe-hash&type=recovery"),
      { params: Promise.resolve({ invitation: undefined, locale: "pt-BR" }) },
    );

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.cookies.get(pendingCookie)?.value).toBe("recovery:safe-hash");
    expect(response.headers.get("location")).toBe("/pt-BR/invite/accept");
  });

  // Only the exchange can tell a live token from a dead one, and the exchange no longer happens
  // here. Refusing to park what looks wrong would put the dead end back where it was.
  it("parks a token it cannot judge", async () => {
    const response = await GET(
      new NextRequest("https://crm.example.test/en-AU/auth/confirm?token_hash=bad-hash&type=invite"),
      { params: Promise.resolve({ invitation: undefined, locale: "en-AU" }) },
    );

    expect(response.cookies.get(pendingCookie)?.value).toBe("invite:bad-hash");
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

    expect(response.cookies.get(pendingCookie)?.value).toBe("invite:safe-hash");
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

  it("keeps the browser on its incoming origin", async () => {
    const response = await GET(
      new NextRequest("http://127.0.0.1:3000/pt-BR/auth/confirm?token_hash=safe-hash&type=recovery"),
      { params: Promise.resolve({ invitation: undefined, locale: "pt-BR" }) },
    );

    expect(response.headers.get("location")).toBe("/pt-BR/invite/accept");
    // A `Secure` cookie is dropped over plain http, which would break local development and
    // every acceptance run with it.
    expect(response.headers.get("set-cookie") ?? "").not.toContain("Secure");
  });

  it("does not park another token type", async () => {
    const response = await GET(
      new NextRequest("https://crm.example.test/pt-BR/auth/confirm?token_hash=safe-hash&type=magiclink"),
      { params: Promise.resolve({ invitation: undefined, locale: "pt-BR" }) },
    );

    expect(response.cookies.get(pendingCookie)).toBeUndefined();
    expect(response.headers.get("location")).toBe(
      "/pt-BR/invite/accept?error=invalid",
    );
  });

  it("does not park a request that carries no token", async () => {
    const response = await GET(
      new NextRequest("https://crm.example.test/en-AU/auth/confirm?type=invite"),
      { params: Promise.resolve({ invitation: undefined, locale: "en-AU" }) },
    );

    expect(response.cookies.get(pendingCookie)).toBeUndefined();
    expect(response.headers.get("location")).toBe("/en-AU/invite/accept?error=invalid");
  });
});
