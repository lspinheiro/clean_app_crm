import type { JobStatus } from "./types";

/**
 * What the card may offer, derived from the job's status.
 *
 * `update_job_status` permits exactly three transitions and raises `check_violation` for
 * anything else, so this union mirrors that RPC rather than describing an ideal lifecycle.
 * A control that fails on tap would be worse than a control that explains why it is shut.
 */
export type JobAction =
  | { kind: "waiting"; reason: string }
  | { kind: "advance"; to: JobStatus; label: string; busyLabel: string }
  | {
      kind: "confirm";
      to: JobStatus;
      label: string;
      confirmLabel: string;
      busyLabel: string;
    };

const BUSY = "Saving…";

export function toJobAction(status: JobStatus): JobAction {
  switch (status) {
    case "draft":
    case "posted":
      // She holds a slot, but the job only becomes `assigned` once the whole crew is in —
      // `assign_job_slot` flips it when active assignments reach crew_size.
      return { kind: "waiting", reason: "Starts once the crew is complete" };
    case "assigned":
      return { kind: "advance", to: "on_the_way", label: "On my way", busyLabel: BUSY };
    case "on_the_way":
      return { kind: "advance", to: "in_progress", label: "Start work", busyLabel: BUSY };
    case "in_progress":
      // Irreversible, and CLE-50's trigger writes the pay ledger in the same transaction.
      return {
        kind: "confirm",
        to: "completed",
        label: "Job done",
        confirmLabel: "Tap again to confirm",
        busyLabel: BUSY,
      };
    // `cleaner_my_jobs` filters both of the following, so neither reaches a card by any
    // route this design knows of. They exist because the switch is exhaustive, and they
    // explain themselves rather than throwing, in case a route it does not know of exists.
    case "completed":
      return { kind: "waiting", reason: "This job is finished." };
    case "cancelled":
      return { kind: "waiting", reason: "This job was cancelled." };
  }
}

type DatabaseError = { message?: string } | null | undefined;

/**
 * The RPC raises with fixed messages that CLE-49's pgTAP suite pins, so they are a stable
 * contract to translate from. Anything else is a bug or an outage: say so plainly rather
 * than forward a Postgres string to someone on a phone.
 */
const statusMessages = new Map<string, string>([
  ["Assigned cleaner access required", "You are not on this job any more."],
  ["Invalid job status transition", "This job has already moved on."],
]);

export function describeStatusError(error: DatabaseError): string {
  return (
    statusMessages.get(error?.message ?? "") ?? "We could not update this job. Try again."
  );
}
