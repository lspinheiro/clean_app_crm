import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getCompanyAdminContext } from "./session";

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
});
