import type { AppLocale } from "@/i18n/config";
import { dateTimeFormatterFor, numberFormatterFor } from "@/i18n/intl";

// Queensland has no daylight saving, so the operating timezone never moves when the
// display language changes.
function dateFormatter(locale: AppLocale) {
  return dateTimeFormatterFor(locale, {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function timeFormatter(locale: AppLocale) {
  return dateTimeFormatterFor(locale, {
    timeZone: "Australia/Brisbane",
    hour: locale === "en-AU" ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12: locale === "en-AU",
  });
}

export function formatJobDate(value: string, locale: AppLocale = "en-AU") {
  return dateFormatter(locale).format(new Date(value));
}

export function formatJobTime(value: string, locale: AppLocale = "en-AU") {
  const formatted = timeFormatter(locale).format(new Date(value));
  return locale === "en-AU" ? formatted.toLowerCase() : formatted;
}

export function formatJobDuration(minutes: number, locale: AppLocale = "en-AU") {
  const number = numberFormatterFor(locale);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${number.format(remainingMinutes)} min`;
  if (!remainingMinutes) return `${number.format(hours)} h`;
  return `${number.format(hours)} h ${number.format(remainingMinutes)} min`;
}

export function formatCleanerPay(cents: number, locale: AppLocale = "en-AU") {
  return numberFormatterFor(locale, {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** A one-cleaner job has nothing to say about crew; a crew job states what is left. */
export function describeOpenSlots(
  openSlots: number,
  crewSize: number,
) {
  return crewSize <= 1
    ? openSlots > 0
      ? { key: "oneSpotOpen" as const, values: undefined }
      : { key: "noSpotsOpen" as const, values: undefined }
    : { key: "crewSpotsOpen" as const, values: { open: openSlots, total: crewSize } };
}
