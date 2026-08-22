import type { AppLocale } from "@/i18n/config";
import { cleanerTranslator } from "@/i18n/messages";

import type { ApplicationStatus } from "./types";

/**
 * What the card may offer, derived from her own application on the job.
 *
 * `closed` exists because `apply_to_job` checks for *any* prior application regardless of
 * its status, and `job_applications` is unique on (job_id, cleaner_id). Withdrawing is
 * therefore final — the pgTAP suite for CLE-49 calls this "withdrawal does not allow queue
 * re-entry". The job stays visible work, so the card stays; the control must say why it is
 * shut rather than fail on tap.
 */
export type VacancyState =
  | { kind: "open" }
  | { kind: "waiting" }
  | { kind: "closed"; reason: string };

export function toVacancyState(
  status: ApplicationStatus | null,
  locale: AppLocale = "en-AU",
): VacancyState {
  const t = cleanerTranslator(locale);
  if (status === null) return { kind: "open" };

  switch (status) {
    case "applied":
      return { kind: "waiting" };
    case "withdrawn":
      return { kind: "closed", reason: t("Board.closedWithdrawn") };
    case "not_selected":
      return { kind: "closed", reason: t("Board.closedNotSelected") };
    case "assigned":
      // Not "you are already on this job": `cleaner_job_board` excludes every job she holds
      // an active assignment on, and `unassign_cleaner` rewrites the application to
      // `not_selected` in the same transaction that releases the slot. So a card can never
      // carry `assigned` while it is true. The honest reason is the one the other closed
      // states give — a prior application row exists, and `apply_to_job` refuses a second.
      return { kind: "closed", reason: t("Board.closedAlreadyApplied") };
  }
}

type DatabaseError = { message?: string } | null | undefined;

/**
 * The RPCs raise with fixed messages that the pgTAP suite pins, so they are a stable
 * contract to translate from. Anything else is a bug or an outage: say so plainly rather
 * than forward a Postgres string to someone on a phone.
 */
export type BoardErrorKey =
  | "errorAlreadyApplied"
  | "errorAlreadyAssigned"
  | "errorApply"
  | "errorFull"
  | "errorNoApplication"
  | "errorUnavailable"
  | "errorWithdraw";

const applyMessageKeys = new Map<string, Exclude<BoardErrorKey, "errorApply" | "errorNoApplication" | "errorWithdraw">>([
  ["Job has no open slots", "errorFull"],
  ["Cleaner can apply only once per job", "errorAlreadyApplied"],
  ["Cleaner is already assigned to this job", "errorAlreadyAssigned"],
  ["Job is not available", "errorUnavailable"],
]);

const withdrawMessageKeys = new Map<string, Extract<BoardErrorKey, "errorNoApplication">>([
  ["Active application not found", "errorNoApplication"],
]);

export function applyErrorKey(error: DatabaseError): BoardErrorKey {
  return applyMessageKeys.get(error?.message ?? "") ?? "errorApply";
}

export function withdrawErrorKey(error: DatabaseError): BoardErrorKey {
  return withdrawMessageKeys.get(error?.message ?? "") ?? "errorWithdraw";
}

export function describeApplyError(
  error: DatabaseError,
  locale: AppLocale = "en-AU",
): string {
  return cleanerTranslator(locale)(`Board.${applyErrorKey(error)}`);
}

export function describeWithdrawError(
  error: DatabaseError,
  locale: AppLocale = "en-AU",
): string {
  return cleanerTranslator(locale)(`Board.${withdrawErrorKey(error)}`);
}
