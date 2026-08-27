import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));

import RosterPage from "./page";

import { getRosterWeekBounds } from "@/features/roster/calendar";

type QueryResult = {
  data: Record<string, unknown>[];
  error: null;
  count: number | null;
};

type ResultOverrides = Partial<Record<string, Partial<QueryResult>>>;
type QueryBuilder = ReturnType<typeof queryBuilder>;

const defaultResults: Record<string, QueryResult> = {
  clients: {
    data: [{ id: "client-1", name: "Oceanview Property Group" }],
    error: null,
    count: 1,
  },
  company_members: {
    data: [{
      profile_id: "cleaner-1",
      profiles: { id: "cleaner-1", full_name: "Ana Costa" },
    }],
    error: null,
    count: 1,
  },
  offers: { data: [], error: null, count: 0 },
  recurring_assignment_cleaners: { data: [], error: null, count: 0 },
  vacancies: { data: [], error: null, count: 0 },
  sites: {
    data: [{
      id: "site-1",
      name: "Harbour Tower",
      clients: { name: "Oceanview Property Group" },
    }],
    error: null,
    count: 1,
  },
  profiles: {
    data: [{ id: "cleaner-1", full_name: "Ana Costa" }],
    error: null,
    count: 1,
  },
  jobs: {
    data: [{
      id: "job-1",
      site_id: "site-1",
      scheduled_start: "2026-08-10T00:00:00Z",
      crew_size: 1,
      status: "assigned",
    }],
    error: null,
    count: 1,
  },
  job_assignments: {
    data: [{ job_id: "job-1", cleaner_id: "cleaner-1", slot_number: 1 }],
    error: null,
    count: 1,
  },
};

function resultFor(table: string, overrides: ResultOverrides): QueryResult {
  const base = defaultResults[table];
  if (!base) throw new Error(`Unexpected table ${table}`);
  return { ...base, ...overrides[table] };
}

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    overrideTypes: vi.fn(),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  for (const method of [
    builder.select,
    builder.eq,
    builder.in,
    builder.gte,
    builder.lt,
    builder.is,
    builder.order,
    builder.overrideTypes,
  ]) {
    method.mockReturnValue(builder);
  }
  return builder;
}

function immediateSupabase(overrides: ResultOverrides = {}) {
  return {
    from: vi.fn((table: string) => queryBuilder(resultFor(table, overrides))),
  };
}

function trackedSupabase(overrides: ResultOverrides = {}) {
  const builders = new Map<string, QueryBuilder>();
  const client = {
    from: vi.fn((table: string) => {
      const builder = queryBuilder(resultFor(table, overrides));
      builders.set(table, builder);
      return builder;
    }),
  };
  return {
    client,
    query(table: string) {
      const builder = builders.get(table);
      if (!builder) throw new Error(`No query was made for ${table}`);
      return builder;
    },
  };
}

async function renderPage(supabase: ReturnType<typeof immediateSupabase>) {
  mocks.requireCompanyAdmin.mockResolvedValue({
    company: { id: "company-1" },
    supabase,
  });
  return RosterPage({ searchParams: Promise.resolve({ week: "2026-08-10" }) });
}

function deferredSupabase() {
  const pending = new Set<{
    resolve: (result: QueryResult) => void;
    result: QueryResult;
  }>();

  return {
    client: {
      from: vi.fn((table: string) => {
        const result = resultFor(table, {});
        let resolvePromise!: (value: QueryResult) => void;
        const promise = new Promise<QueryResult>((resolve) => {
          resolvePromise = resolve;
        });
        const deferred = { resolve: resolvePromise, result };
        const builder = queryBuilder(result);
        builder.then = (onFulfilled, onRejected) => {
          pending.add(deferred);
          return promise.then(onFulfilled, onRejected);
        };
        return builder;
      }),
    },
    resolveWave() {
      const wave = [...pending];
      pending.clear();
      for (const query of wave) query.resolve(query.result);
      return wave.length;
    },
    pendingCount: () => pending.size,
  };
}

async function flushQueries() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("CLE-35 roster data integrity", () => {
  beforeEach(() => {
    mocks.requireCompanyAdmin.mockReset();
  });

  it("fails loudly when the jobs result is truncated", async () => {
    await expect(renderPage(immediateSupabase({ jobs: { count: 2 } }))).rejects.toThrow(
      "weekly jobs result exceeded",
    );
  });

  it("fails loudly when the assignments result is truncated", async () => {
    await expect(
      renderPage(immediateSupabase({ job_assignments: { count: 2 } })),
    ).rejects.toThrow("weekly assignment result exceeded");
  });

  it("loads the roster in no more than two sequential query waves after auth", async () => {
    const harness = deferredSupabase();
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "company-1" },
      supabase: harness.client,
    });
    let settled = false;
    const page = RosterPage({
      searchParams: Promise.resolve({ week: "2026-08-10" }),
    }).finally(() => {
      settled = true;
    });

    let waves = 0;
    while (!settled && waves < 6) {
      await flushQueries();
      if (harness.pendingCount() > 0) {
        harness.resolveWave();
        waves += 1;
      }
    }
    await page;

    expect(waves).toBeLessThanOrEqual(2);
  });

  it("keeps every projection minimal and scoped to the signed-in company", async () => {
    const harness = trackedSupabase();
    await renderPage(harness.client);
    const { startsAt, endsAt } = getRosterWeekBounds("2026-08-10");

    expect(harness.query("sites").select).toHaveBeenCalledWith(
      "id, name, clients!inner(name)",
      { count: "exact" },
    );
    expect(harness.query("sites").eq).toHaveBeenCalledWith(
      "clients.company_id",
      "company-1",
    );
    expect(harness.query("company_members").eq).toHaveBeenCalledWith(
      "company_id",
      "company-1",
    );
    expect(harness.query("company_members").select).toHaveBeenCalledWith(
      "profile_id, profiles!inner(id, full_name)",
      { count: "exact" },
    );
    expect(harness.query("company_members").eq).toHaveBeenCalledWith("status", "active");
    expect(harness.query("vacancies").select).toHaveBeenCalledWith(
      "job_id, site_id, site_name, scheduled_start, crew_slot, crew_size",
      { count: "exact" },
    );
    expect(harness.query("vacancies").eq).toHaveBeenCalledWith(
      "company_id",
      "company-1",
    );
    expect(harness.query("vacancies").gte).toHaveBeenCalledWith("scheduled_start", startsAt);
    expect(harness.query("vacancies").lt).toHaveBeenCalledWith("scheduled_start", endsAt);
    expect(harness.query("offers").select).toHaveBeenCalledWith(
      "id, job_id, cleaner_id, jobs!inner(scheduled_start)",
      { count: "exact" },
    );
    expect(harness.query("offers").eq).toHaveBeenCalledWith("company_id", "company-1");
    expect(harness.query("offers").eq).toHaveBeenCalledWith("status", "pending");
    expect(harness.query("offers").gte).toHaveBeenCalledWith(
      "jobs.scheduled_start",
      startsAt,
    );
    expect(harness.query("offers").lt).toHaveBeenCalledWith(
      "jobs.scheduled_start",
      endsAt,
    );
    expect(harness.query("recurring_assignment_cleaners").select).toHaveBeenCalledWith(
      "recurring_assignment_id, cleaner_id, slot_number, recurring_assignments!inner(sites!inner(clients!inner(company_id)))",
      { count: "exact" },
    );
    expect(harness.query("recurring_assignment_cleaners").is).toHaveBeenCalledWith(
      "accepted_at",
      null,
    );
    expect(harness.query("recurring_assignment_cleaners").eq).toHaveBeenCalledWith(
      "recurring_assignments.sites.clients.company_id",
      "company-1",
    );
    expect(harness.query("jobs").select).toHaveBeenCalledWith(
      "id, site_id, scheduled_start, crew_size, status, recurring_assignment_id",
      { count: "exact" },
    );
    expect(harness.query("jobs").in).toHaveBeenCalledWith("site_id", ["site-1"]);
    expect(harness.query("jobs").gte).toHaveBeenCalledWith("scheduled_start", startsAt);
    expect(harness.query("jobs").lt).toHaveBeenCalledWith("scheduled_start", endsAt);
    expect(harness.query("jobs").in).toHaveBeenCalledWith("status", [
      "posted",
      "assigned",
      "on_the_way",
      "in_progress",
      "completed",
    ]);
    expect(harness.query("job_assignments").select).toHaveBeenCalledWith(
      "job_id, cleaner_id, slot_number, jobs!inner(site_id)",
      { count: "exact" },
    );
    expect(harness.query("job_assignments").in).toHaveBeenCalledWith(
      "jobs.site_id",
      ["site-1"],
    );
    expect(harness.query("job_assignments").gte).toHaveBeenCalledWith(
      "assignment_start",
      startsAt,
    );
    expect(harness.query("job_assignments").lt).toHaveBeenCalledWith(
      "assignment_start",
      endsAt,
    );
    expect(harness.query("job_assignments").is).toHaveBeenCalledWith(
      "unassigned_at",
      null,
    );
  });
});

describe("CLE-55 roster offered projection", () => {
  beforeEach(() => {
    mocks.requireCompanyAdmin.mockReset();
  });

  it("shows unaccepted series and directed offers without subtracting them from the vacancy count", async () => {
    const page = await renderPage(immediateSupabase({
      company_members: {
        data: [
          {
            profile_id: "cleaner-1",
            profiles: { id: "cleaner-1", full_name: "Ana Costa" },
          },
          {
            profile_id: "cleaner-2",
            profiles: { id: "cleaner-2", full_name: "Bea Lima" },
          },
        ],
        count: 2,
      },
      jobs: {
        data: [
          {
            id: "job-series",
            site_id: "site-1",
            scheduled_start: "2026-08-10T00:00:00Z",
            crew_size: 1,
            status: "posted",
            recurring_assignment_id: "series-1",
          },
          {
            id: "job-directed",
            site_id: "site-1",
            scheduled_start: "2026-08-11T00:00:00Z",
            crew_size: 2,
            status: "posted",
            recurring_assignment_id: null,
          },
        ],
        count: 2,
      },
      offers: {
        data: [{ id: "offer-1", job_id: "job-directed", cleaner_id: "cleaner-2" }],
        count: 1,
      },
      recurring_assignment_cleaners: {
        data: [{
          recurring_assignment_id: "series-1",
          cleaner_id: "cleaner-1",
          slot_number: 1,
          recurring_assignments: {
            sites: { clients: { company_id: "company-1" } },
          },
        }],
        count: 1,
      },
      job_assignments: { data: [], count: 0 },
      vacancies: {
        data: [{
          job_id: "job-directed",
          site_id: "site-1",
          site_name: "Harbour Tower",
          scheduled_start: "2026-08-11T00:00:00Z",
          crew_slot: 2,
          crew_size: 2,
        }],
        count: 1,
      },
    }));

    expect(page.props.model.vacancyCount).toBe(1);
    expect(page.props.model.rows).toEqual([
      expect.objectContaining({
        kind: "gaps",
        cells: expect.objectContaining({
          "2026-08-11": [expect.objectContaining({ kind: "gap", key: "job-directed:2" })],
        }),
      }),
      expect.objectContaining({
        label: "Ana Costa",
        cells: expect.objectContaining({
          "2026-08-10": [expect.objectContaining({ kind: "offered", jobId: "job-series" })],
        }),
      }),
      expect.objectContaining({
        label: "Bea Lima",
        cells: expect.objectContaining({
          "2026-08-11": [expect.objectContaining({ kind: "offered", jobId: "job-directed" })],
        }),
      }),
    ]);
  });

  it("rebuilds an unaccepted series as assigned or vacant from current rows on the next load", async () => {
    const job = {
      id: "job-series",
      site_id: "site-1",
      scheduled_start: "2026-08-10T00:00:00Z",
      crew_size: 1,
      status: "posted",
      recurring_assignment_id: "series-1",
    };
    const offered = await renderPage(immediateSupabase({
      jobs: { data: [job], count: 1 },
      job_assignments: { data: [], count: 0 },
      recurring_assignment_cleaners: {
        data: [{
          recurring_assignment_id: "series-1",
          cleaner_id: "cleaner-1",
          slot_number: 1,
          recurring_assignments: {
            sites: { clients: { company_id: "company-1" } },
          },
        }],
        count: 1,
      },
    }));
    const accepted = await renderPage(immediateSupabase({
      jobs: { data: [{ ...job, status: "assigned" }], count: 1 },
      job_assignments: {
        data: [{ job_id: "job-series", cleaner_id: "cleaner-1", slot_number: 1 }],
        count: 1,
      },
      recurring_assignment_cleaners: { data: [], count: 0 },
    }));
    const declined = await renderPage(immediateSupabase({
      jobs: { data: [job], count: 1 },
      job_assignments: { data: [], count: 0 },
      recurring_assignment_cleaners: { data: [], count: 0 },
      vacancies: {
        data: [{
          job_id: "job-series",
          site_id: "site-1",
          site_name: "Harbour Tower",
          scheduled_start: "2026-08-10T00:00:00Z",
          crew_slot: 1,
          crew_size: 1,
        }],
        count: 1,
      },
    }));

    expect(offered.props.model.rows[0].cells["2026-08-10"]).toEqual([
      expect.objectContaining({ kind: "offered", jobId: "job-series" }),
    ]);
    expect(accepted.props.model.rows[0].cells["2026-08-10"]).toEqual([
      expect.objectContaining({ kind: "job", jobId: "job-series" }),
    ]);
    expect(declined.props.model.rows[0].cells["2026-08-10"]).toEqual([
      expect.objectContaining({ kind: "gap", jobId: "job-series" }),
    ]);
    expect(declined.props.model.vacancyCount).toBe(1);
  });
});
