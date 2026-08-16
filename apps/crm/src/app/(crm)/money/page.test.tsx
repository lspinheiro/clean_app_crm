import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));

import MoneyPage from "./page";

type QueryResult = {
  count: number | null;
  data: unknown[];
  error: Error | null;
};

function queryBuilder(...results: QueryResult[]) {
  let activeResult = results[0];
  let rangeCall = 0;
  const emptyResult: QueryResult = {
    count: results[0]?.count ?? null,
    data: [],
    error: null,
  };
  const builder = {
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    select: vi.fn(),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(activeResult ?? emptyResult).then(onFulfilled, onRejected),
  };
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.range.mockImplementation(() => {
    activeResult = results[rangeCall] ?? emptyResult;
    rangeCall += 1;
    return builder;
  });
  builder.select.mockReturnValue(builder);
  return builder;
}

function ledgerRow(index: number) {
  const suffix = index.toString().padStart(12, "0");
  return {
    amount_cents: 12000,
    cleaner_name: `Cleaner ${index}`,
    company_id: "10000000-0000-4000-8000-000000000010",
    job_id: `20000000-0000-4000-8000-${suffix}`,
    ledger_entry_id: `30000000-0000-4000-8000-${suffix}`,
    scheduled_start: "2026-08-04T08:00:00+10:00",
    site_name: "Broadbeach Towers",
    status: "owed",
  };
}

describe("CLE-43 Money route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("loads the complete company ledger and renders crew-slot totals without actions", async () => {
    const query = queryBuilder({
      count: 2,
      data: [
        {
          amount_cents: 12000,
          cleaner_name: "Demo Cleaner One",
          company_id: "10000000-0000-4000-8000-000000000010",
          job_id: "10000000-0000-4000-8000-000000000801",
          ledger_entry_id: "10000000-0000-4000-8000-000000000901",
          scheduled_start: "2026-08-04T08:00:00+10:00",
          site_name: "Broadbeach Towers",
          status: "paid",
        },
        {
          amount_cents: 12000,
          cleaner_name: "Demo Cleaner Two",
          company_id: "10000000-0000-4000-8000-000000000010",
          job_id: "10000000-0000-4000-8000-000000000801",
          ledger_entry_id: "10000000-0000-4000-8000-000000000902",
          scheduled_start: "2026-08-04T08:00:00+10:00",
          site_name: "Broadbeach Towers",
          status: "owed",
        },
      ],
      error: null,
    });
    const supabase = { from: vi.fn(() => query) };
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "10000000-0000-4000-8000-000000000010" },
      supabase,
    });

    render(await MoneyPage());

    expect(mocks.requireCompanyAdmin).toHaveBeenCalledOnce();
    expect(supabase.from).toHaveBeenCalledWith("company_ledger_entries");
    expect(query.select).toHaveBeenCalledWith(
      "ledger_entry_id, company_id, cleaner_name, job_id, site_name, scheduled_start, amount_cents, status",
      { count: "exact" },
    );
    expect(query.eq).toHaveBeenCalledWith(
      "company_id",
      "10000000-0000-4000-8000-000000000010",
    );
    expect(query.order).toHaveBeenCalledWith("scheduled_start", {
      ascending: false,
    });
    expect(query.range).toHaveBeenCalledWith(0, 999);

    const totals = within(screen.getByRole("region", { name: "Money totals" }));
    expect(totals.getAllByText("$120.00")).toHaveLength(2);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("Demo Cleaner One")).toBeInTheDocument();
    expect(screen.getByText("Demo Cleaner Two")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Broadbeach Towers/ })).toHaveLength(2);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/mark paid/i)).not.toBeInTheDocument();
  });

  it("loads every row when the ledger exceeds PostgREST's row cap", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      ledgerRow(index + 1),
    );
    const query = queryBuilder(
      { count: 1001, data: firstPage, error: null },
      { count: 1001, data: [ledgerRow(1001)], error: null },
    );
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "10000000-0000-4000-8000-000000000010" },
      supabase: { from: vi.fn(() => query) },
    });

    render(await MoneyPage());

    expect(query.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(query.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(screen.getByText("Cleaner 1001")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1002);
  });

  it("fails closed instead of calculating totals from a truncated ledger", async () => {
    const query = queryBuilder(
      {
        count: 2,
        data: [
          {
            amount_cents: 12000,
            cleaner_name: "Demo Cleaner One",
            company_id: "10000000-0000-4000-8000-000000000010",
            job_id: "10000000-0000-4000-8000-000000000801",
            ledger_entry_id: "10000000-0000-4000-8000-000000000901",
            scheduled_start: "2026-08-04T08:00:00+10:00",
            site_name: "Broadbeach Towers",
            status: "paid",
          },
        ],
        error: null,
      },
      { count: 2, data: [], error: null },
    );
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "10000000-0000-4000-8000-000000000010" },
      supabase: { from: vi.fn(() => query) },
    });

    await expect(MoneyPage()).rejects.toThrow(
      "Could not load the complete company pay ledger.",
    );
  });

  it("surfaces an error from a later ledger page", async () => {
    const laterError = new Error("Could not load the second ledger page");
    const query = queryBuilder(
      {
        count: 1001,
        data: Array.from({ length: 1000 }, (_, index) => ledgerRow(index + 1)),
        error: null,
      },
      { count: 1001, data: [], error: laterError },
    );
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "10000000-0000-4000-8000-000000000010" },
      supabase: { from: vi.fn(() => query) },
    });

    await expect(MoneyPage()).rejects.toBe(laterError);
  });
});
