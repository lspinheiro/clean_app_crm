import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return {
    channel,
    createBrowserClient: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    refresh: vi.fn(),
    removeChannel: vi.fn(),
    requireCompanyAdmin: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));
vi.mock("@/lib/supabase/browser", () => ({
  createClient: mocks.createBrowserClient,
}));

import JobDetailPage from "./page";

type QueryResult = {
  data: unknown;
  error: Error | null;
};

type QueryBuilder = ReturnType<typeof queryBuilder>;

const jobId = "22000000-0000-4000-8000-000000000501";

const defaultResults: Record<string, QueryResult> = {
  jobs: {
    data: {
      id: jobId,
      status: "posted",
      scheduled_start: "2026-08-17T22:00:00Z",
      duration_minutes: 120,
      cleaner_pay_cents: 15000,
      client_charge_cents: 42000,
      notes: "Internal handover",
      crew_size: 2,
      site_id: "10000000-0000-4000-8000-000000000401",
      service_id: "30000000-0000-4000-8000-000000000002",
      sites: {
        id: "10000000-0000-4000-8000-000000000401",
        name: "Broadbeach Towers",
        address: "10 Surf Parade",
        suburb: "Broadbeach",
        access_notes: "Collect the key",
        clients: {
          id: "10000000-0000-4000-8000-000000000301",
          name: "Oceanview Property Group",
          company_id: "10000000-0000-4000-8000-000000000010",
        },
      },
      service_catalogue: { name: "Standard clean" },
    },
    error: null,
  },
  job_assignments: {
    data: [
      {
        cleaner_id: "10000000-0000-4000-8000-000000000002",
        slot_number: 1,
        source: "recurring",
        assigned_at: "2026-08-11T08:00:00Z",
        unassigned_at: null,
        profiles: { full_name: "Demo Cleaner One" },
      },
    ],
    error: null,
  },
  job_applications: {
    data: [
      {
        cleaner_id: "10000000-0000-4000-8000-000000000004",
        status: "applied",
        applied_at: "2026-08-11T07:00:00Z",
        profiles: { full_name: "Unranked Applicant" },
      },
      {
        cleaner_id: "10000000-0000-4000-8000-000000000003",
        status: "applied",
        applied_at: "2026-08-11T08:00:00Z",
        profiles: { full_name: "Preferred Applicant" },
      },
    ],
    error: null,
  },
  company_members: {
    data: [
      {
        profile_id: "10000000-0000-4000-8000-000000000002",
        profiles: {
          id: "10000000-0000-4000-8000-000000000002",
          full_name: "Demo Cleaner One",
        },
      },
      {
        profile_id: "10000000-0000-4000-8000-000000000003",
        profiles: {
          id: "10000000-0000-4000-8000-000000000003",
          full_name: "Preferred Applicant",
        },
      },
      {
        profile_id: "10000000-0000-4000-8000-000000000007",
        profiles: {
          id: "10000000-0000-4000-8000-000000000007",
          full_name: "Membership-only Cleaner",
        },
      },
      {
        profile_id: "10000000-0000-4000-8000-000000000004",
        profiles: {
          id: "10000000-0000-4000-8000-000000000004",
          full_name: "Unranked Applicant",
        },
      },
    ],
    error: null,
  },
  site_preferred_cleaners: {
    data: [
      {
        cleaner_id: "10000000-0000-4000-8000-000000000003",
        rank: 2,
      },
    ],
    error: null,
  },
};

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  for (const method of [
    builder.select,
    builder.eq,
    builder.order,
    builder.maybeSingle,
  ]) {
    method.mockReturnValue(builder);
  }
  return builder;
}

function trackedSupabase(overrides: Partial<Record<string, QueryResult>> = {}) {
  const builders = new Map<string, QueryBuilder>();
  const client = {
    from: vi.fn((table: string) => {
      const result = overrides[table] ?? defaultResults[table];
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

describe("CLE-22 job detail route", () => {
  beforeEach(() => {
    mocks.createBrowserClient.mockReturnValue({
      channel: vi.fn(() => mocks.channel),
      removeChannel: mocks.removeChannel,
    });
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("rejects malformed IDs before authentication", async () => {
    await expect(
      JobDetailPage({ params: Promise.resolve({ jobId: "not-a-uuid" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
  });

  it("uses the same not-found response for a missing or foreign job", async () => {
    const harness = trackedSupabase({ jobs: { data: null, error: null } });
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "10000000-0000-4000-8000-000000000010" },
      supabase: harness.client,
    });

    await expect(
      JobDetailPage({ params: Promise.resolve({ jobId }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(harness.query("jobs").eq).toHaveBeenCalledWith(
      "sites.clients.company_id",
      "10000000-0000-4000-8000-000000000010",
    );
  });

  it("loads minimal company-scoped admin detail and ranked assignment choices", async () => {
    const harness = trackedSupabase();
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "10000000-0000-4000-8000-000000000010" },
      supabase: harness.client,
    });

    render(await JobDetailPage({ params: Promise.resolve({ jobId }) }));

    expect(screen.getByRole("heading", { name: "Broadbeach Towers" })).toBeInTheDocument();
    const applicants = within(
      screen.getByRole("list", { name: "Job applicants" }),
    ).getAllByRole("listitem");
    expect(applicants[0]).toHaveTextContent("Preferred Applicant");
    expect(applicants[1]).toHaveTextContent("Unranked Applicant");
    expect(screen.getByRole("article", { name: "Crew slot 1" })).toHaveTextContent(
      "Demo Cleaner One",
    );
    const slotTwoChoices = within(screen.getByLabelText("Cleaner for slot 2"))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(slotTwoChoices).toContain("Membership-only Cleaner");
    expect(slotTwoChoices).not.toContain("Demo Cleaner One");
    expect(slotTwoChoices.filter((choice) => choice === "Membership-only Cleaner"))
      .toHaveLength(1);

    expect(harness.query("jobs").select).toHaveBeenCalledWith(
      "id, status, scheduled_start, duration_minutes, cleaner_pay_cents, client_charge_cents, notes, crew_size, site_id, service_id, sites!inner(id, name, address, suburb, access_notes, clients!inner(id, name, company_id)), service_catalogue!inner(name, slug)",
    );
    expect(harness.query("jobs").eq).toHaveBeenCalledWith(
      "sites.clients.company_id",
      "10000000-0000-4000-8000-000000000010",
    );
    expect(harness.query("company_members").eq).toHaveBeenCalledWith(
      "company_id",
      "10000000-0000-4000-8000-000000000010",
    );
    expect(harness.query("company_members").eq).toHaveBeenCalledWith(
      "status",
      "active",
    );
    expect(harness.query("job_assignments").eq).toHaveBeenCalledWith(
      "job_id",
      jobId,
    );
    expect(harness.query("job_applications").eq).toHaveBeenCalledWith(
      "job_id",
      jobId,
    );
    expect(harness.query("site_preferred_cleaners").eq).toHaveBeenCalledWith(
      "site_id",
      "10000000-0000-4000-8000-000000000401",
    );
  });
});
