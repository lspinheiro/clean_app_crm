import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  renderWorkspace: vi.fn(),
  requireCompanyAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));
vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));
vi.mock("./client-detail-workspace", () => ({
  ClientDetailWorkspace: (props: unknown) => {
    mocks.renderWorkspace(props);
    return null;
  },
}));

import ClientDetailPage from "./page";

type QueryResult = {
  data: unknown;
  error: Error | null;
};

type QueryBuilder = ReturnType<typeof queryBuilder>;

const clientId = "10000000-0000-4000-8000-000000000301";
const siteId = "10000000-0000-4000-8000-000000000401";
const serviceId = "30000000-0000-4000-8000-000000000002";
const recurringAssignmentId = "10000000-0000-4000-8000-000000000701";
const offeredCleanerId = "10000000-0000-4000-8000-000000000002";
const acceptedCleanerId = "10000000-0000-4000-8000-000000000003";

const results: Record<string, QueryResult> = {
  clients: {
    data: {
      id: clientId,
      name: "Oceanview Property Group",
      contact_name: null,
      phone: null,
      notes: null,
    },
    error: null,
  },
  sites: {
    data: [{
      id: siteId,
      client_id: clientId,
      name: "Broadbeach Towers",
      address: "10 Surf Parade",
      suburb: "Broadbeach",
      access_notes: null,
      default_service_id: serviceId,
      default_duration_minutes: 120,
      default_rate_cents: 12000,
    }],
    error: null,
  },
  service_catalogue: {
    data: [{ id: serviceId, name: "Standard clean", slug: "standard-clean" }],
    error: null,
  },
  company_members: {
    data: [{ profile_id: offeredCleanerId }, { profile_id: acceptedCleanerId }],
    error: null,
  },
  profiles: {
    data: [
      { id: offeredCleanerId, full_name: "Cleaner A" },
      { id: acceptedCleanerId, full_name: "Cleaner B" },
    ],
    error: null,
  },
  site_preferred_cleaners: { data: [], error: null },
  recurring_assignments: {
    data: [{
      id: recurringAssignmentId,
      site_id: siteId,
      service_id: serviceId,
      frequency: "weekly",
      weekday: 1,
      anchor_date: "2026-08-10",
      local_start_time: "08:00:00",
      duration_minutes: 120,
      cleaner_pay_cents: 12000,
      crew_size: 2,
      active: true,
    }],
    error: null,
  },
  recurring_assignment_cleaners: {
    data: [
      {
        recurring_assignment_id: recurringAssignmentId,
        slot_number: 1,
        cleaner_id: offeredCleanerId,
        accepted_at: null,
      },
      {
        recurring_assignment_id: recurringAssignmentId,
        slot_number: 2,
        cleaner_id: acceptedCleanerId,
        accepted_at: "2026-08-26T20:00:00Z",
      },
    ],
    error: null,
  },
  offers: {
    data: [{
      recurring_assignment_id: recurringAssignmentId,
      cleaner_id: offeredCleanerId,
      created_at: "2026-08-26T22:00:00Z",
    }],
    error: null,
  },
};

function queryBuilder(result: QueryResult) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
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
    builder.in,
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
      const result = overrides[table] ?? results[table];
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

describe("CLE-54 recurring assignment consent route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("loads offered and accepted state from the current database rows", async () => {
    const harness = trackedSupabase();
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "10000000-0000-4000-8000-000000000010" },
      supabase: harness.client,
    });

    render(await ClientDetailPage({ params: Promise.resolve({ clientId }) }));

    expect(harness.query("recurring_assignment_cleaners").select).toHaveBeenCalledWith(
      "recurring_assignment_id, slot_number, cleaner_id, accepted_at",
    );
    expect(harness.query("offers").eq).toHaveBeenCalledWith("status", "pending");
    expect(mocks.renderWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      recurringAssignmentsBySite: {
        [siteId]: [expect.objectContaining({
          namedCleaners: [
            expect.objectContaining({
              id: offeredCleanerId,
              consentState: {
                status: "offered",
                createdAt: "2026-08-26T22:00:00Z",
              },
            }),
            expect.objectContaining({
              id: acceptedCleanerId,
              consentState: { status: "accepted" },
            }),
          ],
        })],
      },
    }));
  });

  it("keeps an unaccepted cleaner offered when the pending-offer read loses a race", async () => {
    const harness = trackedSupabase({ offers: { data: [], error: null } });
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "10000000-0000-4000-8000-000000000010" },
      supabase: harness.client,
    });

    render(await ClientDetailPage({ params: Promise.resolve({ clientId }) }));

    expect(mocks.renderWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      recurringAssignmentsBySite: {
        [siteId]: [expect.objectContaining({
          namedCleaners: [
            expect.objectContaining({
              id: offeredCleanerId,
              consentState: { status: "offered" },
            }),
            expect.objectContaining({
              id: acceptedCleanerId,
              consentState: { status: "accepted" },
            }),
          ],
        })],
      },
    }));
  });
});
