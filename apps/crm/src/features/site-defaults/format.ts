import type { SiteSummary } from "@/features/clients/types";

export function formatAud(cents: number, locale = "en-AU") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDuration(minutes: number, locale = "en-AU") {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(minutes / 60)} h`;
}

export function formatSiteDefaults(site: SiteSummary, locale = "en-AU") {
  if (
    !site.defaultService ||
    site.defaultDurationMinutes === null ||
    site.defaultRateCents === null
  ) {
    return locale === "pt-BR" ? "Padrões não definidos" : "Defaults not set";
  }

  return [
    site.defaultService.name,
    formatDuration(site.defaultDurationMinutes, locale),
    formatAud(site.defaultRateCents, locale),
  ].join(" · ");
}
