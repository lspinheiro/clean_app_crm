import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postingComposer: vi.fn(() => null),
  requireCompanyAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));
vi.mock("@/i18n/service-label", () => ({
  getServiceLabel: (service: { name: string }) => service.name,
}));
vi.mock("./posting-composer", () => ({
  PostingComposer: mocks.postingComposer,
}));

import PostingComposerPage from "./page";

type QueryResult = { data: unknown[]; error: Error | null };

const companyId = "10000000-0000-4000-8000-000000000010";
const jobId = "22000000-0000-4000-8000-000000000501";
const recurringAssignmentId = "10000000-0000-4000-8000-000000000701";
const prefillCases: Array<{
  expectedIntent: string;
  expectedTargetId: string;
  searchParams: Record<string, string>;
}> = [
  {
    expectedIntent: "one_time",
    expectedTargetId: jobId,
    searchParams: { intent: "one_time", jobId },
  },
  {
    expectedIntent: "regular",
    expectedTargetId: recurringAssignmentId,
    searchParams: { intent: "regular", recurringAssignmentId },
  },
];
const unavailablePrefillCases: Array<Record<string, string>> = [
  {
    intent: "one_time",
    jobId: "22000000-0000-4000-8000-000000000599",
  },
  {
    intent: "regular",
    recurringAssignmentId: "10000000-0000-4000-8000-000000000799",
  },
];

const results: Record<string, QueryResult> = {
  vacancies: {
    data: [{
      cleaner_pay_cents: 15000,
      duration_minutes: 120,
      job_id: jobId,
      scheduled_start: "2099-09-07T22:00:00Z",
      service_catalogue: { name: "Standard clean", slug: "standard" },
      sites: { name: "Broadbeach Towers", suburb: "Broadbeach" },
    }],
    error: null,
  },
  recurring_assignments: {
    data: [{
      active: true,
      cleaner_pay_cents: 13000,
      crew_size: 2,
      duration_minutes: 90,
      frequency: "weekly",
      id: recurringAssignmentId,
      local_start_time: "08:00:00",
      recurring_assignment_cleaners: [{
        cleaner_id: "10000000-0000-4000-8000-000000000002",
      }],
      service_catalogue: { name: "Hotel clean", slug: "hotel" },
      sites: {
        clients: { company_id: companyId },
        name: "Surfers Hotel",
        suburb: "Surfers Paradise",
      },
      weekday: 2,
    }],
    error: null,
  },
};

function queryBuilder(result: QueryResult) {
  const builder = {
    eq: vi.fn(),
    gt: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  builder.eq.mockReturnValue(builder);
  builder.gt.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  return builder;
}

function trackedSupabase() {
  const builders = new Map<string, ReturnType<typeof queryBuilder>>();
  return {
    client: {
      from: vi.fn((table: string) => {
        const result = results[table];
        if (!result) throw new Error(`Unexpected table ${table}`);
        const builder = queryBuilder(result);
        builders.set(table, builder);
        return builder;
      }),
    },
    query(table: string) {
      const builder = builders.get(table);
      if (!builder) throw new Error(`No query made for ${table}`);
      return builder;
    },
  };
}

async function renderPage(searchParams: Record<string, string> = {}) {
  const harness = trackedSupabase();
  mocks.requireCompanyAdmin.mockResolvedValue({
    company: { id: companyId },
    supabase: harness.client,
  });
  render(await PostingComposerPage({ searchParams: Promise.resolve(searchParams) }));
  return harness;
}

describe("CLE-60 posting composer route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });
  afterEach(() => {
    cleanup();
    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });

  it("loads only the public job and recurring-assignment preview projections", async () => {
    const harness = await renderPage();

    expect(harness.query("vacancies").select).toHaveBeenCalledWith(
      "job_id, scheduled_start, duration_minutes, cleaner_pay_cents, sites!inner(name, suburb), service_catalogue!inner(name, slug)",
    );
    expect(harness.query("vacancies").eq).toHaveBeenCalledWith("company_id", companyId);
    expect(harness.query("recurring_assignments").select).toHaveBeenCalledWith(
      "id, active, frequency, weekday, local_start_time, duration_minutes, cleaner_pay_cents, crew_size, sites!inner(name, suburb, clients!inner(company_id)), service_catalogue!inner(name, slug), recurring_assignment_cleaners(cleaner_id)",
    );
    expect(harness.query("recurring_assignments").eq).toHaveBeenCalledWith(
      "sites.clients.company_id",
      companyId,
    );
  });

  it.each(prefillCases)("prefills the eligible $expectedIntent record", async ({
    expectedIntent,
    expectedTargetId,
    searchParams,
  }) => {
    await renderPage(searchParams);

    expect(mocks.postingComposer).toHaveBeenCalledWith(
      expect.objectContaining({
        initialIntent: expectedIntent,
        initialTargetId: expectedTargetId,
      }),
      undefined,
    );
  });

  it.each(unavailablePrefillCases)(
    "explains when the supplied work record is not eligible",
    async (searchParams) => {
      await renderPage(searchParams);

      expect(mocks.postingComposer).toHaveBeenCalledWith(
        expect.objectContaining({ initialIntent: null, initialTargetId: null }),
        undefined,
      );
      expect(screen.getByRole("alert")).toHaveTextContent(
        /is not currently postable, so it cannot be shared publicly/i,
      );
    },
  );

  it("translates the ineligible-record notice into Brazilian Portuguese", async () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";

    await renderPage({
      intent: "one_time",
      jobId: "22000000-0000-4000-8000-000000000599",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Este serviço não pode receber um anúncio no momento e, por isso, não pode ser compartilhado publicamente.",
    );
  });
});
