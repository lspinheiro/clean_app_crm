import type { AppLocale } from "@/i18n/config";
import { dateTimeFormatterFor } from "@/i18n/intl";

export function formatSeriesWeekday(weekday: number, locale: AppLocale): string {
  const monday = Date.UTC(2024, 0, 1);
  return dateTimeFormatterFor(locale, {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(monday + (weekday - 1) * 24 * 60 * 60 * 1000));
}

export function formatSeriesTime(value: string, locale: AppLocale): string {
  const [hour, minute] = value.split(":").map(Number);
  const instant = new Date(Date.UTC(2024, 0, 1, hour, minute));
  const formatted = dateTimeFormatterFor(locale, {
    timeZone: "UTC",
    hour: locale === "en-AU" ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12: locale === "en-AU",
  }).format(instant);
  return locale === "en-AU" ? formatted.toLowerCase() : formatted;
}
