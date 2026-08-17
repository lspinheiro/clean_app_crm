import type { SiteSummary } from "@/features/clients/types";

const audFormatters = new Map<string, Intl.NumberFormat>();
const durationFormatters = new Map<string, Intl.NumberFormat>();

export function formatAud(cents: number, locale = "en-AU") {
  let formatter = audFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    audFormatters.set(locale, formatter);
  }
  return formatter.format(cents / 100);
}

export function formatDuration(minutes: number, locale = "en-AU") {
  let formatter = durationFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    durationFormatters.set(locale, formatter);
  }
  return `${formatter.format(minutes / 60)} h`;
}

export function formatSiteDefaults(
  site: SiteSummary,
  locale: string,
  defaultsNotSet: string,
) {
  if (
    !site.defaultService ||
    site.defaultDurationMinutes === null ||
    site.defaultRateCents === null
  ) {
    return defaultsNotSet;
  }

  return [
    site.defaultService.name,
    formatDuration(site.defaultDurationMinutes, locale),
    formatAud(site.defaultRateCents, locale),
  ].join(" · ");
}
