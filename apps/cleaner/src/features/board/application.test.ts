import { describe, expect, it } from "vitest";

import { describeApplyError, describeWithdrawError, toVacancyState } from "./application";
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
      reason: "You withdrew from this job.",
    });
  });

  it("closes the card when the job went to someone else", () => {
    expect(toVacancyState("not_selected")).toEqual({
      kind: "closed",
      reason: "This job went to someone else.",
    });
  });

  it("never claims she is on a job the board only shows because she is not", () => {
    // `cleaner_job_board` hides any job she holds an active assignment on, and the unassign
    // RPC rewrites the application to `not_selected` in the same transaction. An `assigned`
    // status therefore cannot reach a card while it is true — the only honest reason left
    // is the one the other closed states give: a prior application row exists.
    expect(toVacancyState("assigned")).toEqual({
      kind: "closed",
      reason: "You already applied to this job.",
    });
  });

  it("has a state for every application status the database can store", () => {
    const every: ApplicationStatus[] = ["applied", "assigned", "not_selected", "withdrawn"];

    for (const status of every) {
      expect(toVacancyState(status).kind).toMatch(/^(open|waiting|closed)$/);
    }
  });
});

describe("CLE-21 apply errors read as plain English", () => {
  it.each([
    ["Job has no open slots", "This job is full now."],
    ["Cleaner can apply only once per job", "You already applied to this job."],
    ["Cleaner is already assigned to this job", "You are already on this job."],
    ["Job is not available", "This job is not open to you any more."],
  ])("turns %s into a sentence she can act on", (message, expected) => {
    expect(describeApplyError({ message })).toBe(expected);
  });

  it("never leaks a raw database message", () => {
    expect(describeApplyError({ message: 'duplicate key value violates unique constraint "x"' })).toBe(
      "We could not send your application. Try again.",
    );
  });

  it("copes with an error that carries no message at all", () => {
    expect(describeApplyError(null)).toBe("We could not send your application. Try again.");
  });
});

describe("CLE-21 withdraw errors read as plain English", () => {
  it("explains a missing application", () => {
    expect(describeWithdrawError({ message: "Active application not found" })).toBe(
      "You do not have an application to withdraw.",
    );
  });

  it("falls back without leaking internals", () => {
    expect(describeWithdrawError({ message: "deadlock detected" })).toBe(
      "We could not withdraw your application. Try again.",
    );
  });
});
