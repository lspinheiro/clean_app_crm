import type { SiteSummary } from "@/features/clients/types";

const audFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const durationFormatter = new Intl.NumberFormat("en-AU", {
  maximumFractionDigits: 2,
});

export function formatAud(cents: number) {
  return audFormatter.format(cents / 100);
}

export function formatDuration(minutes: number) {
  return `${durationFormatter.format(minutes / 60)} h`;
}

export function formatSiteDefaults(site: SiteSummary) {
  if (
    !site.defaultService ||
    site.defaultDurationMinutes === null ||
    site.defaultRateCents === null
  ) {
    return "Defaults not set";
  }

  return [
    site.defaultService.name,
    formatDuration(site.defaultDurationMinutes),
    formatAud(site.defaultRateCents),
  ].join(" · ");
}
