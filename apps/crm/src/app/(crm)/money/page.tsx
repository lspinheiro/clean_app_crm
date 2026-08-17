import type { Metadata } from "next";

import { MoneyList } from "./money-list";

import { buildCompanyMoneyLedger } from "@/features/money/model";
import type { CompanyLedgerProjection } from "@/features/money/types";
import { requireCompanyAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Money" };

const ledgerPageSize = 1000;
const incompleteLedgerMessage = "Could not load the complete company pay ledger.";

export default async function MoneyPage() {
  const { company, supabase } = await requireCompanyAdmin();
  const ledgerRows: CompanyLedgerProjection[] = [];
  let exactCount: number | null = null;
  let offset = 0;

  while (exactCount === null || ledgerRows.length < exactCount) {
    const { count, data, error } = await supabase
      .from("company_ledger_entries")
      .select(
        "ledger_entry_id, company_id, cleaner_name, job_id, site_name, scheduled_start, amount_cents, status",
        { count: "exact" },
      )
      .eq("company_id", company.id)
      .order("scheduled_start", { ascending: false })
      .order("ledger_entry_id")
      .range(offset, offset + ledgerPageSize - 1);
    if (error) throw error;
    if (!data || count === null || (exactCount !== null && count !== exactCount)) {
      throw new Error(incompleteLedgerMessage);
    }

    exactCount = count;
    ledgerRows.push(...data);
    if (data.length === 0) break;
    offset += data.length;
  }

  const ledger = buildCompanyMoneyLedger(ledgerRows, exactCount);

  return (
    <main className="page-shell money-page-shell">
      <header className="money-page-header">
        <h1 className="page-heading">Money</h1>
        <p className="page-description">
          A shared record of agreed cleaner pay. The Clean Crew records settlement; it never moves money.
        </p>
      </header>
      <MoneyList ledger={ledger} />
    </main>
  );
}
