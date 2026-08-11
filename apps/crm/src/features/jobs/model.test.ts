import { describe, expect, it } from "vitest";

import { buildJobSlots, sortJobApplicants, sortPoolCandidates } from "./model";
import type { JobApplicant, JobAssignmentRecord, JobPoolCandidate } from "./types";

describe("CLE-22 job detail model", () => {
  it("orders applicants by exact site preference, then application time", () => {
    const applicants: JobApplicant[] = [
      {
        cleanerId: "40000000-0000-4000-8000-000000000004",
        cleanerName: "Unranked Earlier",
        status: "applied",
        appliedAt: "2026-08-11T08:00:00Z",
        preferredRank: null,
      },
      {
        cleanerId: "40000000-0000-4000-8000-000000000002",
        cleanerName: "Preferred Two",
        status: "applied",
        appliedAt: "2026-08-11T07:00:00Z",
        preferredRank: 2,
      },
      {
        cleanerId: "40000000-0000-4000-8000-000000000001",
        cleanerName: "Preferred One",
        status: "applied",
        appliedAt: "2026-08-11T09:00:00Z",
        preferredRank: 1,
      },
      {
        cleanerId: "40000000-0000-4000-8000-000000000003",
        cleanerName: "Unranked Later",
        status: "applied",
        appliedAt: "2026-08-11T10:00:00Z",
        preferredRank: null,
      },
    ];

    expect(sortJobApplicants(applicants).map((item) => item.cleanerName)).toEqual([
      "Preferred One",
      "Preferred Two",
      "Unranked Earlier",
      "Unranked Later",
    ]);
  });

  it("orders direct pool candidates by preference then name", () => {
    const candidates: JobPoolCandidate[] = [
      {
        cleanerId: "40000000-0000-4000-8000-000000000004",
        cleanerName: "Zoe Pool",
        preferredRank: null,
      },
      {
        cleanerId: "40000000-0000-4000-8000-000000000002",
        cleanerName: "Bea Preferred",
        preferredRank: 2,
      },
      {
        cleanerId: "40000000-0000-4000-8000-000000000001",
        cleanerName: "Ari Preferred",
        preferredRank: 1,
      },
      {
        cleanerId: "40000000-0000-4000-8000-000000000003",
        cleanerName: "Ana Pool",
        preferredRank: null,
      },
    ];

    expect(sortPoolCandidates(candidates).map((item) => item.cleanerName)).toEqual([
      "Ari Preferred",
      "Bea Preferred",
      "Ana Pool",
      "Zoe Pool",
    ]);
  });

  it("derives every numbered crew slot and preserves released history", () => {
    const assignments: JobAssignmentRecord[] = [
      {
        cleanerId: "40000000-0000-4000-8000-000000000001",
        cleanerName: "Active Cleaner",
        slotNumber: 1,
        source: "manual",
        assignedAt: "2026-08-11T08:00:00Z",
        unassignedAt: null,
      },
      {
        cleanerId: "40000000-0000-4000-8000-000000000002",
        cleanerName: "Released Cleaner",
        slotNumber: 2,
        source: "manual",
        assignedAt: "2026-08-10T08:00:00Z",
        unassignedAt: "2026-08-10T09:00:00Z",
      },
    ];

    expect(
      buildJobSlots({ assignments, crewSize: 3, status: "posted" }),
    ).toEqual([
      {
        slotNumber: 1,
        state: "assigned",
        assignment: {
          cleanerId: assignments[0].cleanerId,
          cleanerName: "Active Cleaner",
          source: "manual",
          assignedAt: "2026-08-11T08:00:00Z",
        },
      },
      {
        slotNumber: 2,
        state: "open",
        previousAssignment: {
          cleanerId: assignments[1].cleanerId,
          cleanerName: "Released Cleaner",
          source: "manual",
          assignedAt: "2026-08-10T08:00:00Z",
          releasedAt: "2026-08-10T09:00:00Z",
        },
      },
      {
        slotNumber: 3,
        state: "open",
        previousAssignment: null,
      },
    ]);

    expect(
      buildJobSlots({ assignments, crewSize: 3, status: "cancelled" }),
    ).toEqual([
      {
        slotNumber: 1,
        state: "assigned",
        assignment: {
          cleanerId: assignments[0].cleanerId,
          cleanerName: "Active Cleaner",
          source: "manual",
          assignedAt: "2026-08-11T08:00:00Z",
        },
      },
      {
        slotNumber: 2,
        state: "closed",
        previousAssignment: {
          cleanerId: assignments[1].cleanerId,
          cleanerName: "Released Cleaner",
          source: "manual",
          assignedAt: "2026-08-10T08:00:00Z",
          releasedAt: "2026-08-10T09:00:00Z",
        },
      },
      {
        slotNumber: 3,
        state: "closed",
        previousAssignment: null,
      },
    ]);
  });
});
