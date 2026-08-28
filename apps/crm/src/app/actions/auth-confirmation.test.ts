import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieDelete: vi.fn(),
  cookieGet: vi.fn(),
  cookies: vi.fn(),
  createClient: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { continuePendingConfirmationAction } from "./auth-confirmation";

const pendingCookie = "crm_pending_confirmation";

function parked(value: string | undefined) {
  mocks.cookieGet.mockImplementation((name: string) =>
    name === pendingCookie && value !== undefined ? { name, value } : undefined,
  );
}

describe("continuing a parked invitation confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      delete: mocks.cookieDelete,
      get: mocks.cookieGet,
    });
    mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "s" } }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp: mocks.verifyOtp } });
  });

  // The exchange lives here rather than in the route because this is the only step a person
  // takes. Everything a GET can reach is now read-only.
  it("exchanges the parked token", async () => {
    parked("invite:safe-hash");

    await expect(continuePendingConfirmationAction()).resolves.toEqual({ ok: true });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "safe-hash",
      type: "invite",
    });
  });

  it("exchanges a parked recovery token", async () => {
    parked("recovery:safe-hash");

    await expect(continuePendingConfirmationAction()).resolves.toEqual({ ok: true });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "safe-hash",
      type: "recovery",
    });
  });

  // A token survives exactly one exchange, so keeping it would only let a reload retry
  // something that cannot succeed — and leave a spent credential in the browser.
  it("clears the parked token whether or not the exchange worked", async () => {
    parked("invite:safe-hash");
    await continuePendingConfirmationAction();
    expect(mocks.cookieDelete).toHaveBeenCalledWith(pendingCookie);

    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ delete: mocks.cookieDelete, get: mocks.cookieGet });
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp: mocks.verifyOtp } });
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "expired" } });
    parked("invite:dead-hash");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(continuePendingConfirmationAction()).resolves.toEqual({ ok: false });
    expect(mocks.cookieDelete).toHaveBeenCalledWith(pendingCookie);
    // The reason has to survive somewhere the invitee cannot see it, the way a failed
    // invitation delivery does.
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("refuses when nothing was parked", async () => {
    parked(undefined);

    await expect(continuePendingConfirmationAction()).resolves.toEqual({ ok: false });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it.each([
    ["a value with no separator", "safe-hash"],
    ["an empty token", "invite:"],
    ["a token type this product never issues", "magiclink:safe-hash"],
  ])("refuses %s", async (_label, value) => {
    parked(value);

    await expect(continuePendingConfirmationAction()).resolves.toEqual({ ok: false });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});
