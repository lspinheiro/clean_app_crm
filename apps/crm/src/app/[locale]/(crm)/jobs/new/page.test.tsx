import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  newJobForm: vi.fn(() => null),
  requireCompanyAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));
vi.mock("./new-job-form", () => ({
  NewJobForm: mocks.newJobForm,
}));

import NewJobPage from "./page";

type QueryResult = {
  data: unknown[];
  error: Error | null;
};

type QueryBuilder = ReturnType<typeof queryBuilder>;

const companyId = "10000000-0000-4000-8000-000000000010";
const clientId = "10000000-0000-4000-8000-000000000301";
const siteId = "10000000-0000-4000-8000-000000000401";
const serviceId = "30000000-0000-4000-8000-000000000002";

const results: Record<string, QueryResult> = {
  clients: {
    data: [{ id: clientId, name: "Oceanview Property Group" }],
    error: null,
  },
  sites: {
    data: [
      {
        id: siteId,
        client_id: clientId,
        name: "Broadbeach Towers",
        suburb: "Broadbeach",
        default_service_id: serviceId,
        default_duration_minutes: 75,
        default_rate_cents: 18250,
      },
    ],
    error: null,
  },
  service_catalogue: {
    data: [{ id: serviceId, name: "Standard clean" }],
    error: null,
  },
};

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  return builder;
}

function trackedSupabase() {
  const builders = new Map<string, QueryBuilder>();
  const client = {
    from: vi.fn((table: string) => {
      const result = results[table];
      if (!result) throw new Error(`Unexpected table ${table}`);
      const builder = queryBuilder(result);
      builders.set(table, builder);
      return builder;
    }),
  };
  return {
    client,
    query(table: string) {
      const builder = builders.get(table);
      if (!builder) throw new Error(`No query made for ${table}`);
      return builder;
    },
  };
}

describe("CLE-23 new job route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("scopes clients and sites to the company and maps each site default exactly", async () => {
    const harness = trackedSupabase();
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: companyId },
      supabase: harness.client,
    });

    render(await NewJobPage());

    expect(harness.query("clients").eq).toHaveBeenCalledWith(
      "company_id",
      companyId,
    );
    expect(harness.query("sites").select).toHaveBeenCalledWith(
      "id, client_id, name, suburb, default_service_id, default_duration_minutes, default_rate_cents, clients!inner(company_id)",
    );
    expect(harness.query("sites").eq).toHaveBeenCalledWith(
      "clients.company_id",
      companyId,
    );
    expect(mocks.newJobForm).toHaveBeenCalledWith(
      {
        clients: [
          {
            id: clientId,
            name: "Oceanview Property Group",
            sites: [
              {
                id: siteId,
                name: "Broadbeach Towers",
                suburb: "Broadbeach",
                defaultServiceId: serviceId,
                defaultDurationMinutes: 75,
                defaultRateCents: 18250,
              },
            ],
          },
        ],
        services: [{ id: serviceId, name: "Standard clean" }],
      },
      undefined,
    );
  });
});
