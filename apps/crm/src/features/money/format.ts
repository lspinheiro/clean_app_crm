import type { MoneyStatus } from "./types";

import { formatBrisbaneTime } from "@/lib/format/schedule";

const moneyAmountFormatters = new Map<string, Intl.NumberFormat>();
const moneyDateFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatMoneyAmount(cents: number, locale = "en-AU") {
  let formatter = moneyAmountFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    moneyAmountFormatters.set(locale, formatter);
  }
  return formatter.format(cents / 100);
}

export function formatMoneyJobDate(value: string, locale = "en-AU") {
  let formatter = moneyDateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: "Australia/Brisbane",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    moneyDateFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(value));
}

export function formatMoneyJobTime(value: string, locale = "en-AU") {
  return formatBrisbaneTime(value, locale);
}

export function formatMoneyStatus(
  status: MoneyStatus,
  translate: (key: "statusOwed" | "statusPaid") => string,
) {
  return translate(status === "owed" ? "statusOwed" : "statusPaid");
}
