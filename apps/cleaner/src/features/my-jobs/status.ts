import type { JobStatus } from "./types";

/**
 * What the card may offer, derived from the job's status.
 *
 * `update_job_status` permits exactly three transitions and raises `check_violation` for
 * anything else, so this union mirrors that RPC rather than describing an ideal lifecycle.
 * A control that fails on tap would be worse than a control that explains why it is shut.
 */
export type JobAction =
  | { kind: "waiting"; reason: "cancelled" | "finished" | "waitingCrew" }
  | {
      kind: "advance";
      to: JobStatus;
      label: "onMyWay" | "startWork";
      busyLabel: "saving";
    }
  | {
      kind: "confirm";
      to: JobStatus;
      label: "jobDone";
      confirmLabel: "confirmDone";
      busyLabel: "saving";
    };

export function toJobAction(status: JobStatus): JobAction {
  switch (status) {
    case "draft":
    case "posted":
      // She holds a slot, but the job only becomes `assigned` once the whole crew is in —
      // `assign_job_slot` flips it when active assignments reach crew_size.
      return { kind: "waiting", reason: "waitingCrew" };
    case "assigned":
      return { kind: "advance", to: "on_the_way", label: "onMyWay", busyLabel: "saving" };
    case "on_the_way":
      return { kind: "advance", to: "in_progress", label: "startWork", busyLabel: "saving" };
    case "in_progress":
      // Irreversible, and CLE-50's trigger writes the pay ledger in the same transaction.
      return {
        kind: "confirm",
        to: "completed",
        label: "jobDone",
        confirmLabel: "confirmDone",
        busyLabel: "saving",
      };
    // `cleaner_my_jobs` filters both of the following, so neither reaches a card by any
    // route this design knows of. They exist because the switch is exhaustive, and they
    // explain themselves rather than throwing, in case a route it does not know of exists.
    case "completed":
      return { kind: "waiting", reason: "finished" };
    case "cancelled":
      return { kind: "waiting", reason: "cancelled" };
  }
}

type DatabaseError = { message?: string } | null | undefined;

export type StatusErrorKey = "errorMoved" | "errorNoAccess" | "errorUpdate";

export function statusErrorKey(error: DatabaseError): StatusErrorKey {
  if (error?.message === "Assigned cleaner access required") return "errorNoAccess";
  if (error?.message === "Invalid job status transition") return "errorMoved";
  return "errorUpdate";
}

/**
 * The RPC raises with fixed messages that CLE-49's pgTAP suite pins, so they are a stable
 * contract to translate from. Anything else is a bug or an outage: say so plainly rather
 * than forward a Postgres string to someone on a phone.
 */
