import { z } from "zod";

import type {
  CompanyLedgerProjection,
  CompanyMoneyEntry,
  CompanyMoneyLedger,
  MoneyStatus,
} from "./types";

const companyMoneyEntrySchema = z.object({
  amount_cents: z.number().int().positive(),
  cleaner_name: z.string().min(1),
  job_id: z.string().uuid(),
  ledger_entry_id: z.string().uuid(),
  scheduled_start: z.string().datetime({ offset: true }),
  site_name: z.string().min(1),
  status: z.enum(["owed", "paid"]),
});

function assertNever(value: never): never {
  throw new Error(`Unsupported money status: ${String(value)}`);
}

function addEntryAmount(
  totals: Pick<CompanyMoneyLedger, "owedCents" | "paidCents">,
  status: MoneyStatus,
  amountCents: number,
) {
  switch (status) {
    case "owed":
      totals.owedCents += amountCents;
      return;
    case "paid":
      totals.paidCents += amountCents;
      return;
    default:
      assertNever(status);
  }
}

export function buildCompanyMoneyLedger(
  rows: CompanyLedgerProjection[],
  exactCount: number | null,
): CompanyMoneyLedger {
  if (exactCount === null || exactCount !== rows.length) {
    throw new Error("Could not load the complete company pay ledger.");
  }

  const entries: CompanyMoneyEntry[] = rows.map((row) => {
    const parsed = companyMoneyEntrySchema.safeParse(row);
    if (!parsed.success) {
      throw new Error("Company pay ledger returned an invalid entry.");
    }
    return {
      amountCents: parsed.data.amount_cents,
      cleanerName: parsed.data.cleaner_name,
      id: parsed.data.ledger_entry_id,
      jobId: parsed.data.job_id,
      scheduledStart: parsed.data.scheduled_start,
      siteName: parsed.data.site_name,
      status: parsed.data.status,
    };
  });

  const totals = { owedCents: 0, paidCents: 0 };
  for (const entry of entries) {
    addEntryAmount(totals, entry.status, entry.amountCents);
  }

  return { entries, ...totals };
}
