import type { Database } from "@clean-app/db";

export type MoneyStatus = Database["public"]["Enums"]["ledger_status"];

type CompanyLedgerRow =
  Database["public"]["Views"]["company_ledger_entries"]["Row"];

export type CompanyLedgerProjection = Pick<
  CompanyLedgerRow,
  | "amount_cents"
  | "cleaner_name"
  | "company_id"
  | "job_id"
  | "ledger_entry_id"
  | "scheduled_start"
  | "site_name"
  | "status"
>;

export type CompanyMoneyEntry = {
  amountCents: number;
  cleanerName: string;
  id: string;
  jobId: string;
  scheduledStart: string;
  siteName: string;
  status: MoneyStatus;
};

export type CompanyMoneyLedger = {
  entries: CompanyMoneyEntry[];
  owedCents: number;
  paidCents: number;
};
