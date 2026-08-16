import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const resetters: Array<() => void> = [];
  return {
    createClient: vi.fn(),
    reactCache: vi.fn((loader: (...args: unknown[]) => unknown) => {
      let cachedValue: unknown;
      let hasCachedValue = false;
      resetters.push(() => {
        cachedValue = undefined;
        hasCachedValue = false;
      });
      return (...args: unknown[]) => {
        if (!hasCachedValue) {
          cachedValue = loader(...args);
          hasCachedValue = true;
        }
        return cachedValue;
      };
    }),
    resetRequestCache() {
      for (const reset of resetters) reset();
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  cache: mocks.reactCache,
}));

import { getCompanyAdminContext, requireCompanyAdmin } from "./session";

function queryReturning(data: unknown, singleError: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: singleError }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

describe("company-admin session context", () => {
  beforeEach(() => {
    mocks.resetRequestCache();
    vi.clearAllMocks();
  });

  it("returns a controlled denial when an approved company disappears during lookup", async () => {
    const profileQuery = queryReturning({
      id: "user-1",
      role: "company_admin",
      full_name: "Company Admin",
    });
    const membershipQuery = queryReturning({ company_id: "company-1" });
    const companyQuery = queryReturning(null, {
      name: "PostgrestError",
      message: "JSON object requested, multiple (or no) rows returned",
    });
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "profiles") return profileQuery;
        if (table === "company_members") return membershipQuery;
        if (table === "companies") return companyQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    mocks.createClient.mockResolvedValue(supabase);

    await expect(getCompanyAdminContext()).resolves.toMatchObject({
      decision: { kind: "denied", reason: "company_not_approved" },
      company: null,
    });
    expect(companyQuery.maybeSingle).toHaveBeenCalledOnce();
    expect(companyQuery.single).not.toHaveBeenCalled();
  });

  it.each([
    "refresh_token_not_found",
    "refresh_token_already_used",
    "session_expired",
    "session_not_found",
    "user_not_found",
    "bad_jwt",
  ])("treats a dead session with code %s as anonymous", async (code) => {
    const from = vi.fn();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new AuthApiError("Dead session", 400, code),
        }),
      },
      from,
    });

    await expect(getCompanyAdminContext()).resolves.toMatchObject({
      decision: { kind: "denied", reason: "anonymous" },
      user: null,
      profile: null,
      company: null,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("treats a missing session as anonymous", async () => {
    const from = vi.fn();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new AuthSessionMissingError(),
        }),
      },
      from,
    });

    await expect(getCompanyAdminContext()).resolves.toMatchObject({
      decision: { kind: "denied", reason: "anonymous" },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    new AuthApiError("Unexpected auth response", 400, "invalid_credentials"),
    new AuthRetryableFetchError("Auth service unavailable", 503),
  ])("surfaces an unrelated auth failure: $name", async (error) => {
    const from = vi.fn();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error }),
      },
      from,
    });

    await expect(getCompanyAdminContext()).rejects.toBe(error);
    expect(from).not.toHaveBeenCalled();
  });

  it("initialises the company-admin context once for two request consumers", async () => {
    const profileQuery = queryReturning({
      id: "user-1",
      role: "company_admin",
      full_name: "Company Admin",
    });
    const membershipQuery = queryReturning({ company_id: "company-1" });
    const companyQuery = queryReturning({
      id: "company-1",
      name: "Coastal Demo Cleaning",
      status: "approved",
    });
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "profiles") return profileQuery;
        if (table === "company_members") return membershipQuery;
        if (table === "companies") return companyQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    mocks.createClient.mockResolvedValue(supabase);

    const [layoutContext, pageContext] = await Promise.all([
      requireCompanyAdmin(),
      requireCompanyAdmin(),
    ]);

    expect(layoutContext.company.id).toBe("company-1");
    expect(pageContext.company.id).toBe("company-1");
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(supabase.auth.getUser).toHaveBeenCalledOnce();
  });
});
