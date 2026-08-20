import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/actions/clients", () => ({
  createClient: vi.fn(),
  createSite: vi.fn(),
}));

import ClientsPage from "./page";

type QueryResult = { data: Record<string, unknown>[]; error: null };

function queryBuilder(result: QueryResult) {
  const builder = {
    eq: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  return builder;
}

describe("S33 clients company scope", () => {
  it("filters clients and sites to the active company", async () => {
    const queries = new Map<string, ReturnType<typeof queryBuilder>>();
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "company-1" },
      supabase: {
        from: vi.fn((table: string) => {
          const query = queryBuilder({ data: [], error: null });
          queries.set(table, query);
          return query;
        }),
      },
    });

    render(await ClientsPage());

    expect(screen.getByRole("heading", { name: "Clients & sites" })).toBeInTheDocument();
    expect(queries.get("clients")?.eq).toHaveBeenCalledWith("company_id", "company-1");
    expect(queries.get("sites")?.eq).toHaveBeenCalledWith(
      "clients.company_id",
      "company-1",
    );
  });
});
