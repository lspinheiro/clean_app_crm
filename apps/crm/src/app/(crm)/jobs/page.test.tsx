import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));

import JobsPage from "./page";

type QueryResult = {
  data: Record<string, unknown>[];
  error: null;
};

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    order: vi.fn(),
    is: vi.fn(),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  builder.select.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.is.mockReturnValue(builder);
  return builder;
}

describe("CLE-23 jobs entry point", () => {
  beforeEach(() => {
    mocks.requireCompanyAdmin.mockResolvedValue({
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
});
