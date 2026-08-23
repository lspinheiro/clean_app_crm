import { describe, expect, it } from "vitest";

import { applyErrorKey, toVacancyState, withdrawErrorKey } from "./application";
import type { ApplicationStatus } from "./types";

describe("CLE-21 vacancy state", () => {
  it("offers the job when she has never applied", () => {
    expect(toVacancyState(null)).toEqual({ kind: "open" });
  });

  it("shows a waiting state while the application is live", () => {
    expect(toVacancyState("applied")).toEqual({ kind: "waiting" });
  });

  it("closes the card after she withdraws, because the database refuses re-entry", () => {
    // apply_to_job checks for *any* prior application, so withdrawing is final —
    // pgTAP calls this "withdrawal does not allow queue re-entry".
    expect(toVacancyState("withdrawn")).toEqual({
      kind: "closed",
      reason: "closedWithdrawn",
    });
  });

  it("closes the card when the job went to someone else", () => {
    expect(toVacancyState("not_selected")).toEqual({
      kind: "closed",
      reason: "closedNotSelected",
    });
  });

  it("never claims she is on a job the board only shows because she is not", () => {
    // `cleaner_job_board` hides any job she holds an active assignment on, and the unassign
    // RPC rewrites the application to `not_selected` in the same transaction. An `assigned`
    // status therefore cannot reach a card while it is true — the only honest reason left
    // is the one the other closed states give: a prior application row exists.
    expect(toVacancyState("assigned")).toEqual({
      kind: "closed",
      reason: "closedAlreadyApplied",
    });
  });

  it("has a state for every application status the database can store", () => {
    const every: ApplicationStatus[] = ["applied", "assigned", "not_selected", "withdrawn"];

    for (const status of every) {
      expect(toVacancyState(status).kind).toMatch(/^(open|waiting|closed)$/);
    }
  });
});

describe("CLE-21 apply errors map to safe UI keys", () => {
  it.each([
    ["Job has no open slots", "errorFull"],
    ["Cleaner can apply only once per job", "errorAlreadyApplied"],
    ["Cleaner is already assigned to this job", "errorAlreadyAssigned"],
    ["Job is not available", "errorUnavailable"],
  ])("maps %s without leaking the database message", (message, expected) => {
    expect(applyErrorKey({ message })).toBe(expected);
  });

  it("never leaks a raw database message", () => {
    expect(applyErrorKey({ message: 'duplicate key value violates unique constraint "x"' })).toBe("errorApply");
  });

  it("copes with an error that carries no message at all", () => {
    expect(applyErrorKey(null)).toBe("errorApply");
  });
});

describe("CLE-21 withdraw errors map to safe UI keys", () => {
  it("explains a missing application", () => {
    expect(withdrawErrorKey({ message: "Active application not found" })).toBe("errorNoApplication");
  });

  it("falls back without leaking internals", () => {
    expect(withdrawErrorKey({ message: "deadlock detected" })).toBe("errorWithdraw");
  });
});
