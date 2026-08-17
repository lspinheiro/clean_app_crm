export function formatBrisbaneTime(value: string, locale = "en-AU") {
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone: "Australia/Brisbane",
    hour: locale === "pt-BR" ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: locale === "en-AU",
  }).format(new Date(value));

  return locale === "en-AU" ? formatted.toLowerCase() : formatted;
}
