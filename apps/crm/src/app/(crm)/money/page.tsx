import type { Metadata } from "next";

import { MoneyList } from "./money-list";

import { buildCompanyMoneyLedger } from "@/features/money/model";
import { requireCompanyAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Money" };

export default async function MoneyPage() {
  const { company, supabase } = await requireCompanyAdmin();
  const { count, data: ledgerRows, error } = await supabase
    .from("company_ledger_entries")
    .select(
      "ledger_entry_id, company_id, cleaner_name, job_id, site_name, scheduled_start, amount_cents, status",
      { count: "exact" },
    )
    .eq("company_id", company.id)
    .order("scheduled_start", { ascending: false })
    .order("ledger_entry_id");
  if (error) throw error;
  if (!ledgerRows) {
    throw new Error("Could not load the complete company pay ledger.");
  }

  const ledger = buildCompanyMoneyLedger(ledgerRows, count);

  return (
    <main className="page-shell money-page-shell">
      <header className="money-page-header">
        <h1 className="page-heading">Money</h1>
        <p className="page-description">
          A shared record of agreed cleaner pay. Clean App records settlement; it never moves money.
        </p>
      </header>
      <MoneyList ledger={ledger} />
    </main>
  );
}
