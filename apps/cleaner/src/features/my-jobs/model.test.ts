import { describe, expect, it } from "vitest";

import { toMyJobs } from "./model";
import type { MyJobRow } from "./types";

function row(overrides: Partial<MyJobRow> = {}): MyJobRow {
  return {
    assignment_id: "assignment-1",
    job_id: "job-1",
    slot_number: 1,
    company_name: "Coastal Demo Cleaning",
    site_name: "Palm Grove Practice",
    suburb: "Robina",
    service_name: "Standard clean",
    status: "assigned",
    scheduled_start: "2026-08-19T20:00:00+00:00",
    duration_minutes: 90,
    cleaner_pay_cents: 9000,
    ...overrides,
  };
}

describe("CLE-24 my jobs model", () => {
  it("maps a view row to the shape the card renders", () => {
    expect(toMyJobs([row()])[0]).toEqual({
      assignmentId: "assignment-1",
      jobId: "job-1",
      slotNumber: 1,
      companyName: "Coastal Demo Cleaning",
      siteName: "Palm Grove Practice",
      suburb: "Robina",
      serviceName: "Standard clean",
      status: "assigned",
      scheduledStart: "2026-08-19T20:00:00+00:00",
      durationMinutes: 90,
      cleanerPayCents: 9000,
    });
  });

  it("puts the soonest job first", () => {
    const later = row({ job_id: "job-later", scheduled_start: "2026-08-21T20:00:00+00:00" });
    const sooner = row({ job_id: "job-sooner", scheduled_start: "2026-08-20T20:00:00+00:00" });

    expect(toMyJobs([later, sooner]).map((job) => job.jobId)).toEqual([
      "job-sooner",
      "job-later",
    ]);
  });

  it("orders two jobs at the same minute stably rather than by arrival", () => {
    const b = row({ job_id: "job-b", site_name: "Bond Tower" });
    const a = row({ job_id: "job-a", site_name: "Alpha House" });

    expect(toMyJobs([b, a]).map((job) => job.jobId)).toEqual(["job-a", "job-b"]);
    expect(toMyJobs([a, b]).map((job) => job.jobId)).toEqual(["job-a", "job-b"]);
  });

  it("keeps one card per assignment", () => {
    expect(
      toMyJobs([row(), row({ assignment_id: "assignment-2", job_id: "job-2" })]),
    ).toHaveLength(2);
  });
});
