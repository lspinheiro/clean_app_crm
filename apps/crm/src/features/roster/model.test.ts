import { describe, expect, it } from "vitest";

import { buildRosterDays } from "./calendar";
import { buildCleanerRoster } from "./model";

describe("cleaner roster projection", () => {
  it("keeps vacancies in a synthetic row and places assigned jobs by cleaner", () => {
    const model = buildCleanerRoster({
      days: buildRosterDays("2026-08-10"),
      cleaners: [
        { id: "cleaner-1", name: "Ana" },
        { id: "cleaner-2", name: "Bea" },
        { id: "cleaner-3", name: "Clara" },
      ],
      jobs: [
        {
          id: "job-crew",
          siteId: "site-1",
          siteName: "Harbour Tower",
          scheduledStart: "2026-08-09T22:00:00Z",
          crewSize: 2,
        },
        {
          id: "job-open",
          siteId: "site-2",
          siteName: "Ocean Clinic",
          scheduledStart: "2026-08-11T07:30:00Z",
          crewSize: 2,
        },
      ],
      assignments: [{ jobId: "job-crew", cleanerId: "cleaner-1", slotNumber: 1 }],
      vacancies: [
        {
          key: "job-crew:2",
          jobId: "job-crew",
          siteId: "site-1",
          siteName: "Harbour Tower",
          scheduledStart: "2026-08-09T22:00:00Z",
          crewSlot: 2,
          crewSize: 2,
        },
        {
          key: "job-open:1",
          jobId: "job-open",
          siteId: "site-2",
          siteName: "Ocean Clinic",
          scheduledStart: "2026-08-11T07:30:00Z",
          crewSlot: 1,
          crewSize: 2,
        },
        {
          key: "job-open:2",
          jobId: "job-open",
          siteId: "site-2",
          siteName: "Ocean Clinic",
          scheduledStart: "2026-08-11T07:30:00Z",
          crewSlot: 2,
          crewSize: 2,
        },
      ],
    });

    expect(model.vacancyCount).toBe(3);
    expect(model.vacancyKeys).toEqual(["job-crew:2", "job-open:1", "job-open:2"]);
    expect(model.rows.map((row) => row.label)).toEqual([
      "Unfilled slots",
      "Ana",
      "Bea",
      "Clara",
    ]);
    expect(model.rows[0]?.cells["2026-08-10"]).toHaveLength(1);
    expect(model.rows[0]?.cells["2026-08-11"]).toHaveLength(2);
    expect(model.rows[1]?.cells["2026-08-10"]).toEqual([
      expect.objectContaining({ kind: "job", jobId: "job-crew", crewSize: 2 }),
    ]);
    expect(model.rows[2]?.cells["2026-08-10"]).toEqual([]);
    expect(model.rows[3]?.cells["2026-08-10"]).toEqual([]);
  });

  it("retains an assigned cleaner whose removed profile is no longer readable", () => {
    const model = buildCleanerRoster({
      days: buildRosterDays("2026-08-10"),
      cleaners: [],
      jobs: [
        {
          id: "job-1",
          siteId: "site-1",
          siteName: "Site",
          scheduledStart: "2026-08-09T22:00:00Z",
          crewSize: 1,
        },
      ],
      assignments: [{ jobId: "job-1", cleanerId: "removed", slotNumber: 1 }],
      vacancies: [],
    });

    expect(model.rows).toEqual([
      expect.objectContaining({ id: "cleaner:removed", label: "Unavailable cleaner" }),
    ]);
  });
});
