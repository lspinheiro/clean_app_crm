import type { JobStatus } from "./types";

import { formatBrisbaneTime } from "@/lib/format/schedule";

const jobStatusKeys = {
  draft: "statusDraft",
  posted: "statusPosted",
  assigned: "statusAssigned",
  on_the_way: "statusOnTheWay",
  in_progress: "statusInProgress",
  completed: "statusCompleted",
  cancelled: "statusCancelled",
} as const satisfies Record<JobStatus, string>;

type JobStatusKey = (typeof jobStatusKeys)[JobStatus];
const jobDateFormatters = new Map<string, Intl.DateTimeFormat>();
const numberFormatters = new Map<string, Intl.NumberFormat>();
const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatJobDate(value: string, locale = "en-AU") {
  let formatter = jobDateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: "Australia/Brisbane",
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    jobDateFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(value));
}

export function formatJobTime(value: string, locale = "en-AU") {
  return formatBrisbaneTime(value, locale);
}

export function formatJobDuration(minutes: number, locale = "en-AU") {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  let formatNumber = numberFormatters.get(locale);
  if (!formatNumber) {
    formatNumber = new Intl.NumberFormat(locale);
    numberFormatters.set(locale, formatNumber);
  }
  if (!hours) return `${formatNumber.format(remainingMinutes)} min`;
  if (!remainingMinutes) return `${formatNumber.format(hours)} h`;
  return `${formatNumber.format(hours)} h ${formatNumber.format(remainingMinutes)} min`;
}

export function formatCleanerPay(cents: number, locale = "en-AU") {
  const key = `${locale}:${cents % 100 === 0 ? 0 : 2}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter.format(cents / 100);
}

export function formatJobStatus(
  status: JobStatus,
  translate: (key: JobStatusKey) => string,
) {
  return translate(jobStatusKeys[status]);
}
