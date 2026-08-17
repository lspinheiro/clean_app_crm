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

export function toVacancyState(status: ApplicationStatus | null): VacancyState {
  if (status === null) return { kind: "open" };

  switch (status) {
    case "applied":
      return { kind: "waiting" };
    case "withdrawn":
      return { kind: "closed", reason: "You withdrew from this job." };
    case "not_selected":
      return { kind: "closed", reason: "This job went to someone else." };
    case "assigned":
      return { kind: "closed", reason: "You are already on this job." };
  }
}

type DatabaseError = { message?: string } | null | undefined;

/**
 * The RPCs raise with fixed messages that the pgTAP suite pins, so they are a stable
 * contract to translate from. Anything else is a bug or an outage: say so plainly rather
 * than forward a Postgres string to someone on a phone.
 */
const applyMessages = new Map<string, string>([
  ["Job has no open slots", "This job is full now."],
  ["Cleaner can apply only once per job", "You already applied to this job."],
  ["Cleaner is already assigned to this job", "You are already on this job."],
  ["Job is not available", "This job is not open to you any more."],
]);

const withdrawMessages = new Map<string, string>([
  ["Active application not found", "You do not have an application to withdraw."],
]);

export function describeApplyError(error: DatabaseError): string {
  return (
    applyMessages.get(error?.message ?? "") ?? "We could not send your application. Try again."
  );
}

export function describeWithdrawError(error: DatabaseError): string {
  return (
    withdrawMessages.get(error?.message ?? "") ??
    "We could not withdraw your application. Try again."
  );
}
