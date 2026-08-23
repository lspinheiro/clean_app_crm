import type { AppLocale } from "./config";

export type CleanerMessages = typeof import("./catalogues/en-AU")["default"];

export async function loadCleanerMessages(locale: AppLocale): Promise<CleanerMessages> {
  return locale === "pt-BR"
    ? (await import("./catalogues/pt-BR")).default
    : (await import("./catalogues/en-AU")).default;
}
