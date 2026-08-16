import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importWorkspace: vi.fn(() => null),
  requireCompanyAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));
vi.mock("./import-workspace", () => ({
  ImportWorkspace: mocks.importWorkspace,
}));

import ClientsImportPage from "./page";

type QueryResult = { data: unknown[]; error: Error | null };

function queryBuilder(result: QueryResult) {
  const builder = {
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    select: vi.fn(),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.range.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  return builder;
}

describe("CLE-71 import route", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("loads only company clients and sites for duplicate matching", async () => {
    const clientsQuery = queryBuilder({
      data: [
        {
          id: "10000000-0000-4000-8000-000000000301",
          name: "Oceanview Property Group",
        },
        {
          id: "10000000-0000-4000-8000-000000000302",
          name: "Harbour Offices",
        },
      ],
      error: null,
    });
    const sitesQuery = queryBuilder({
      data: [
        {
          client_id: "10000000-0000-4000-8000-000000000301",
          name: "Broadbeach Towers",
          clients: { company_id: "10000000-0000-4000-8000-000000000010" },
        },
      ],
      error: null,
    });
    const supabase = {
      from: vi.fn((table: string) =>
        table === "clients" ? clientsQuery : sitesQuery,
      ),
    };
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "10000000-0000-4000-8000-000000000010" },
      supabase,
    });

    render(await ClientsImportPage());

    expect(clientsQuery.select).toHaveBeenCalledWith("id, name");
    expect(clientsQuery.eq).toHaveBeenCalledWith(
      "company_id",
      "10000000-0000-4000-8000-000000000010",
    );
    expect(sitesQuery.select).toHaveBeenCalledWith(
      "client_id, name, clients!inner(company_id)",
    );
    expect(sitesQuery.eq).toHaveBeenCalledWith(
      "clients.company_id",
      "10000000-0000-4000-8000-000000000010",
    );
    expect(mocks.importWorkspace).toHaveBeenCalledWith(
      {
        clients: [
          {
            id: "10000000-0000-4000-8000-000000000302",
            name: "Harbour Offices",
            siteNames: [],
          },
          {
            id: "10000000-0000-4000-8000-000000000301",
            name: "Oceanview Property Group",
            siteNames: ["Broadbeach Towers"],
          },
        ],
      },
      undefined,
    );
  });
});
