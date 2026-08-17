import type { MoneyStatus } from "./types";

import { formatBrisbaneTime } from "@/lib/format/schedule";

function assertNever(value: never): never {
  throw new Error(`Unsupported money status: ${String(value)}`);
}

export function formatMoneyAmount(cents: number, locale = "en-AU") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatMoneyJobDate(value: string, locale = "en-AU") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatMoneyJobTime(value: string, locale = "en-AU") {
  return formatBrisbaneTime(value, locale);
}

export function formatMoneyStatus(status: MoneyStatus, locale: "en-AU" | "pt-BR" = "en-AU") {
  switch (status) {
    case "owed":
      return locale === "pt-BR" ? "A pagar" : "Owed";
    case "paid":
      return locale === "pt-BR" ? "Pago" : "Paid";
    default:
      return assertNever(status);
  }
}
