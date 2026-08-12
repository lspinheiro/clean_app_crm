import { describe, expect, it } from "vitest";

import { buildCompanyMoneyLedger } from "./model";

const crewRows = [
  {
    amount_cents: 12000,
    cleaner_id: "10000000-0000-4000-8000-000000000002",
    cleaner_name: "Demo Cleaner One",
    company_id: "10000000-0000-4000-8000-000000000010",
    created_at: "2026-08-08T10:05:00+10:00",
    job_id: "10000000-0000-4000-8000-000000000801",
    ledger_entry_id: "10000000-0000-4000-8000-000000000901",
    paid_at: "2026-08-08T12:00:00+10:00",
    payment_note: "bank transfer",
    scheduled_start: "2026-08-08T08:00:00+10:00",
    site_id: "10000000-0000-4000-8000-000000000401",
    site_name: "Broadbeach Towers",
    status: "paid" as const,
  },
  {
    amount_cents: 12000,
    cleaner_id: "10000000-0000-4000-8000-000000000003",
    cleaner_name: "Demo Cleaner Two",
    company_id: "10000000-0000-4000-8000-000000000010",
    created_at: "2026-08-08T10:05:00+10:00",
    job_id: "10000000-0000-4000-8000-000000000801",
    ledger_entry_id: "10000000-0000-4000-8000-000000000902",
    paid_at: null,
    payment_note: null,
    scheduled_start: "2026-08-08T08:00:00+10:00",
    site_id: "10000000-0000-4000-8000-000000000401",
    site_name: "Broadbeach Towers",
    status: "owed" as const,
  },
];

describe("company Money ledger", () => {
  it("keeps one row per crew slot and totals owed and paid separately", () => {
    expect(buildCompanyMoneyLedger(crewRows, 2)).toEqual({
      entries: [
        {
          amountCents: 12000,
          cleanerName: "Demo Cleaner One",
          id: "10000000-0000-4000-8000-000000000901",
          jobId: "10000000-0000-4000-8000-000000000801",
          scheduledStart: "2026-08-08T08:00:00+10:00",
          siteName: "Broadbeach Towers",
          status: "paid",
        },
        {
          amountCents: 12000,
          cleanerName: "Demo Cleaner Two",
          id: "10000000-0000-4000-8000-000000000902",
          jobId: "10000000-0000-4000-8000-000000000801",
          scheduledStart: "2026-08-08T08:00:00+10:00",
          siteName: "Broadbeach Towers",
          status: "owed",
        },
      ],
      owedCents: 12000,
      paidCents: 12000,
    });
  });

  it("puts unequal amounts into their matching settlement totals", () => {
    const owedEntry = {
      ...crewRows[1],
      amount_cents: 8500,
      job_id: "10000000-0000-4000-8000-000000000802",
      ledger_entry_id: "10000000-0000-4000-8000-000000000903",
    };

    expect(buildCompanyMoneyLedger([crewRows[0], owedEntry], 2)).toMatchObject({
      owedCents: 8500,
      paidCents: 12000,
    });
  });

  it.each([null, 3])("rejects an incomplete result with %s count", (count) => {
    expect(() => buildCompanyMoneyLedger(crewRows, count)).toThrow(
      "Could not load the complete company pay ledger.",
    );
  });

  it("rejects nullable view fields instead of rendering invented pay history", () => {
    expect(() =>
      buildCompanyMoneyLedger(
        [{ ...crewRows[0], cleaner_name: null }],
        1,
      ),
    ).toThrow("Company pay ledger returned an invalid entry.");
  });
});
