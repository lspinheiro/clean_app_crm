export const locales = ["en-AU", "pt-BR"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en-AU";
export const languageSelectionEnabled = true;
export const localeCookieName = "NEXT_LOCALE";
export const localeCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return locales.some((locale) => locale === value);
}
