import type { CookieMethodsServer } from "@supabase/ssr";
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getSupabaseBrowserEnv: vi.fn(() => ({
    publishableKey: "test-publishable-key",
    url: "http://127.0.0.1:55321",
  })),
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));
vi.mock("@/lib/supabase/env", () => ({
  getSupabaseBrowserEnv: mocks.getSupabaseBrowserEnv,
}));

import proxy, { config } from "./proxy";

const deletionCookies = [
  {
    name: "sb-127-auth-token.0",
    value: "",
    options: { httpOnly: false, maxAge: 0, path: "/", sameSite: "lax" as const },
  },
  {
    name: "sb-127-auth-token.1",
    value: "",
    options: { httpOnly: false, maxAge: 0, path: "/", sameSite: "lax" as const },
  },
];

const authResponseHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

function requestWithStaleSession() {
  return new NextRequest("http://localhost:3000/en-AU/login", {
    headers: {
      cookie: "sb-127-auth-token.0=stale-a; sb-127-auth-token.1=stale-b",
    },
  });
}

function configureAuthResult(error: Error, clearCookies = false) {
  mocks.createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: CookieMethodsServer }) => {
      mocks.getUser.mockImplementation(async () => {
        if (clearCookies) {
          await options.cookies.setAll?.(deletionCookies, authResponseHeaders);
        }
        return { data: { user: null }, error };
      });
      return { auth: { getUser: mocks.getUser } };
    },
  );
}

describe("Supabase session proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "refresh_token_not_found",
    "refresh_token_already_used",
    "session_expired",
    "session_not_found",
    "user_not_found",
    "bad_jwt",
  ])("recovers a dead session with code %s in one response", async (code) => {
    configureAuthResult(new AuthApiError("Dead session", 400, code), true);

    const response = await proxy(requestWithStaleSession());

    const deletionNames = response.cookies
      .getAll()
      .map(({ name }) => name)
      .filter((name) => name.startsWith("sb-127-auth-token"));
    expect(deletionNames).toEqual([
      "sb-127-auth-token.0",
      "sb-127-auth-token.1",
    ]);
    const authSetCookies = response.headers
      .getSetCookie()
      .filter((cookie) => cookie.startsWith("sb-127-auth-token"));
    expect(authSetCookies).toHaveLength(2);
    expect(authSetCookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^sb-127-auth-token\.0=;.*Max-Age=0/i),
        expect.stringMatching(/^sb-127-auth-token\.1=;.*Max-Age=0/i),
      ]),
    );

    const downstreamCookies = response.headers.get("x-middleware-request-cookie");
    expect(downstreamCookies).toContain("sb-127-auth-token.0=");
    expect(downstreamCookies).toContain("sb-127-auth-token.1=");
    expect(downstreamCookies).not.toContain("stale-a");
    expect(downstreamCookies).not.toContain("stale-b");
    expect(response.headers.get("cache-control")).toBe(authResponseHeaders["Cache-Control"]);
    expect(response.headers.get("expires")).toBe(authResponseHeaders.Expires);
    expect(response.headers.get("pragma")).toBe(authResponseHeaders.Pragma);
  });

  it("continues treating a missing session as anonymous", async () => {
    configureAuthResult(new AuthSessionMissingError());

    await expect(proxy(requestWithStaleSession())).resolves.toBeDefined();
  });

  it("detects Brazilian Portuguese for an unprefixed CRM route", async () => {
    configureAuthResult(new AuthSessionMissingError());
    const request = new NextRequest(
      "http://localhost:3000/roster?week=2026-08-17&view=site",
      {
        headers: { "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" },
      },
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/pt-BR/roster?week=2026-08-17&view=site",
    );
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each([
    "/roster.rsc",
    "/en-AU/roster.segments/__PAGE__.segment.rsc",
    "/clients/foo.bar",
  ])("keeps locale and auth proxying enabled for %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image/logo.png",
    "/templates/clients-import.csv",
  ])("leaves static asset %s outside the proxy", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });

  it.each([
    new AuthApiError("Unexpected auth response", 400, "invalid_credentials"),
    new AuthRetryableFetchError("Auth service unavailable", 503),
    new Error("Unexpected failure"),
  ])("does not suppress an unrelated auth failure: $name", async (error) => {
    configureAuthResult(error);

    await expect(proxy(requestWithStaleSession())).rejects.toBe(error);
  });
});
