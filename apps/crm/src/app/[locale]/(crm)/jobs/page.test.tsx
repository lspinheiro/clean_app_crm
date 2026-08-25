import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return {
    channel,
    createClient: vi.fn(),
    removeChannel: vi.fn(),
    requireCompanyAdmin: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createClient: mocks.createClient,
}));

import JobsPage from "./page";

type QueryResult = {
  data: Record<string, unknown>[];
  error: null;
};

function queryBuilder(result: QueryResult) {
  const builder = {
    eq: vi.fn(),
    select: vi.fn(),
    order: vi.fn(),
    is: vi.fn(),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  builder.eq.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.is.mockReturnValue(builder);
  return builder;
}

describe("CLE-23 jobs entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channel.on.mockReturnValue(mocks.channel);
    mocks.channel.subscribe.mockReturnValue(mocks.channel);
    mocks.createClient.mockReturnValue({
      channel: vi.fn(() => mocks.channel),
      removeChannel: mocks.removeChannel,
    });
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "company-1" },
      supabase: {
        from: vi.fn(() => queryBuilder({ data: [], error: null })),
      },
    });
  });

  it("offers one contextual link to create a new job", async () => {
    render(await JobsPage());

    expect(screen.getByRole("link", { name: "New job" })).toHaveAttribute(
      "href",
      "/jobs/new",
    );
  });

  it("scopes every company-owned list query to the active company", async () => {
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

    render(await JobsPage());

    expect(queries.get("jobs")?.eq).toHaveBeenCalledWith(
      "sites.clients.company_id",
      "company-1",
    );
    expect(queries.get("sites")?.eq).toHaveBeenCalledWith(
      "clients.company_id",
      "company-1",
    );
    expect(queries.get("clients")?.eq).toHaveBeenCalledWith("company_id", "company-1");
    expect(queries.get("job_applications")?.eq).toHaveBeenCalledWith(
      "jobs.sites.clients.company_id",
      "company-1",
    );
    expect(queries.get("job_applications")?.eq).toHaveBeenCalledWith(
      "status",
      "applied",
    );
  });
});
