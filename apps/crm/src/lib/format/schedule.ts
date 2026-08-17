const timeFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatBrisbaneTime(value: string, locale = "en-AU") {
  let formatter = timeFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: "Australia/Brisbane",
      hour: locale === "pt-BR" ? "2-digit" : "numeric",
      minute: "2-digit",
      hour12: locale === "en-AU",
    });
    timeFormatters.set(locale, formatter);
  }
  const formatted = formatter.format(new Date(value));

  return locale === "en-AU" ? formatted.toLowerCase() : formatted;
}
