import type { AppLocale } from "./config";

const collators = new Map<AppLocale, Intl.Collator>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const numberFormatters = new Map<string, Intl.NumberFormat>();

export function collatorFor(locale: AppLocale) {
  const cached = collators.get(locale);
  if (cached) return cached;
  const formatter = new Intl.Collator(locale);
  collators.set(locale, formatter);
  return formatter;
}

export function dateTimeFormatterFor(
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions,
) {
  const key = `${locale}:${JSON.stringify(options)}`;
  const cached = dateTimeFormatters.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, options);
  dateTimeFormatters.set(key, formatter);
  return formatter;
}

export function numberFormatterFor(locale: AppLocale, options?: Intl.NumberFormatOptions) {
  const key = `${locale}:${JSON.stringify(options ?? {})}`;
  const cached = numberFormatters.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(locale, options);
  numberFormatters.set(key, formatter);
  return formatter;
}
