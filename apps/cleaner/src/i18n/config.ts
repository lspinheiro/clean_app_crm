export const locales = ["en-AU", "pt-BR"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en-AU";
export const localeCookieName = "NEXT_LOCALE";
export const localeCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export type CleanerPath =
  | "/"
  | "/login"
  | "/join"
  | "/board"
  | "/offers"
  | "/my-jobs"
  | "/profile";
export type LocalisedCleanerPath =
  | `/${AppLocale}`
  | `/${AppLocale}${Exclude<CleanerPath, "/">}`;

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return locales.some((locale) => locale === value);
}

export function localeFromLanguages(languages: readonly string[]): AppLocale {
  for (const language of languages) {
    const normalised = language.toLowerCase();
    if (normalised.startsWith("pt")) return "pt-BR";
    if (normalised.startsWith("en")) return "en-AU";
  }

  return defaultLocale;
}

export function localePrefix(pathname: string): AppLocale | null {
  const candidate = pathname.split("/").filter(Boolean)[0];
  return isAppLocale(candidate) ? candidate : null;
}

export function localeFromCookieString(cookie: string): AppLocale | null {
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${localeCookieName}=`))
    ?.slice(localeCookieName.length + 1);
  return isAppLocale(value) ? value : null;
}

export function publicLocaleFor(
  pathname: string,
  cookie: string,
  languages: readonly string[],
): AppLocale {
  return localePrefix(pathname) ?? localeFromCookieString(cookie) ?? localeFromLanguages(languages);
}

export function persistLocaleCookie(locale: AppLocale) {
  if (typeof document === "undefined") return;
  document.cookie = `${localeCookieName}=${locale}; path=/; max-age=${localeCookieMaxAgeSeconds}; samesite=lax`;
}

export function localePath(locale: AppLocale, pathname: CleanerPath): LocalisedCleanerPath;
export function localePath(locale: AppLocale, pathname: string): string;
export function localePath(locale: AppLocale, pathname: string): string {
  const normalised = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const currentLocale = localePrefix(normalised);
  const withoutLocale = currentLocale
    ? normalised.slice(currentLocale.length + 1) || "/"
    : normalised;
  return `/${locale}${withoutLocale === "/" ? "" : withoutLocale}`;
}

export function pathWithoutLocale(pathname: string): string {
  const currentLocale = localePrefix(pathname);
  return currentLocale ? pathname.slice(currentLocale.length + 1) || "/" : pathname || "/";
}

export function localisedAddress(
  locale: AppLocale,
  pathname: CleanerPath,
  search?: string,
  hash?: string,
): `/${AppLocale}${string}`;
export function localisedAddress(
  locale: AppLocale,
  pathname: string,
  search?: string,
  hash?: string,
): string;
export function localisedAddress(
  locale: AppLocale,
  pathname: string,
  search = "",
  hash = "",
): string {
  return `${localePath(locale, pathname)}${search}${hash}`;
}
