import { describe, expect, it } from "vitest";

import { statusErrorKey, toJobAction } from "./status";
import type { JobStatus } from "./types";

describe("CLE-24 the card offers only what the database allows", () => {
  it("says why a job she is rostered on cannot start yet", () => {
    // A crew-2 job stays `posted` until every slot fills, so she can be committed to work
    // that update_job_status will not move out of `posted`.
    for (const status of ["draft", "posted"] as const) {
      expect(toJobAction(status)).toEqual({
        kind: "waiting",
        reason: "waitingCrew",
      });
    }
  });

  it("offers on-my-way once the crew is complete", () => {
    expect(toJobAction("assigned")).toEqual({
      kind: "advance",
      to: "on_the_way",
      label: "onMyWay",
      busyLabel: "saving",
    });
  });

  it("offers start-work once she is on the way", () => {
    expect(toJobAction("on_the_way")).toEqual({
      kind: "advance",
      to: "in_progress",
      label: "startWork",
      busyLabel: "saving",
    });
  });

  it("asks for a second tap before finishing, because finishing is irreversible", () => {
    expect(toJobAction("in_progress")).toEqual({
      kind: "confirm",
      to: "completed",
      label: "jobDone",
      confirmLabel: "confirmDone",
      busyLabel: "saving",
    });
  });

  it("explains a finished or cancelled job instead of offering a control", () => {
    expect(toJobAction("completed")).toEqual({
      kind: "waiting",
      reason: "finished",
    });
    expect(toJobAction("cancelled")).toEqual({
      kind: "waiting",
      reason: "cancelled",
    });
  });

  it("never proposes a transition update_job_status would reject", () => {
    const allowed = new Set([
      "assigned:on_the_way",
      "on_the_way:in_progress",
      "in_progress:completed",
    ]);
    const every: JobStatus[] = [
      "draft",
      "posted",
      "assigned",
      "on_the_way",
      "in_progress",
      "completed",
      "cancelled",
    ];

    for (const status of every) {
      const action = toJobAction(status);
      if (action.kind === "waiting") continue;
      expect(allowed.has(`${status}:${action.to}`)).toBe(true);
    }
  });
});

describe("CLE-24 status errors map to safe UI keys", () => {
  it.each([
    ["Assigned cleaner access required", "errorNoAccess"],
    ["Invalid job status transition", "errorMoved"],
  ])("maps %s without leaking the database message", (message, expected) => {
    expect(statusErrorKey({ message })).toBe(expected);
  });

  it("never leaks a raw database message", () => {
    expect(statusErrorKey({ message: "deadlock detected" })).toBe("errorUpdate");
  });

  it("copes with an error carrying no message at all", () => {
    expect(statusErrorKey(null)).toBe("errorUpdate");
  });
});
