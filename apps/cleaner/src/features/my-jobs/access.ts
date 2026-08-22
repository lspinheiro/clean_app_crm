import type { AppLocale } from "@/i18n/config";
import { cleanerTranslator } from "@/i18n/messages";

/**
 * A universal https link — not a `geo:` URI and no platform sniffing. It opens the native
 * app on Android and iOS, the browser everywhere else, and keeps working inside the
 * Capacitor shell ADR 0004 leaves open.
 *
 * This does disclose the client's site address to Google at the moment she taps. Raised
 * and accepted in the design; see the spec's "Maps handoff" section.
 */
export function toMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

type DatabaseError = { message?: string } | null | undefined;

export type AccessErrorKey = "errorAddress" | "errorAddressUnavailable";

export function accessErrorKey(error: DatabaseError): AccessErrorKey {
  return error?.message === "Job access is unavailable"
    ? "errorAddressUnavailable"
    : "errorAddress";
}

/**
 * `get_cleaner_job_access` raises one fixed message, pinned by CLE-49's pgTAP suite.
 * Anything else is a bug or an outage.
 */
export function describeAccessError(
  error: DatabaseError,
  locale: AppLocale = "en-AU",
): string {
  return cleanerTranslator(locale)(`MyJobs.${accessErrorKey(error)}`);
}
