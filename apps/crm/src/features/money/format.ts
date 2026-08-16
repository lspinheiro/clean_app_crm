import type { MoneyStatus } from "./types";

import { formatBrisbaneTime } from "@/lib/format/schedule";

const amountFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const brisbaneDateFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Brisbane",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function assertNever(value: never): never {
  throw new Error(`Unsupported money status: ${String(value)}`);
}

export function formatMoneyAmount(cents: number) {
  return amountFormatter.format(cents / 100);
}

export function formatMoneyJobDate(value: string) {
  return brisbaneDateFormatter.format(new Date(value));
}

export function formatMoneyJobTime(value: string) {
  return formatBrisbaneTime(value);
}

export function formatMoneyStatus(status: MoneyStatus) {
  switch (status) {
    case "owed":
      return "Owed";
    case "paid":
      return "Paid";
    default:
      return assertNever(status);
  }
}
