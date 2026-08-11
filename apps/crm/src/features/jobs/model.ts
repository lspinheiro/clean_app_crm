import type {
  JobApplicant,
  JobAssignmentRecord,
  JobPoolCandidate,
  JobSlot,
  JobStatus,
} from "./types";

export function sortJobApplicants(applicants: JobApplicant[]) {
  return [...applicants].sort((left, right) => {
    const rankDifference =
      (left.preferredRank ?? Number.MAX_SAFE_INTEGER) -
      (right.preferredRank ?? Number.MAX_SAFE_INTEGER);
    if (rankDifference) return rankDifference;
    const appliedDifference = left.appliedAt.localeCompare(right.appliedAt);
    if (appliedDifference) return appliedDifference;
    return left.cleanerId.localeCompare(right.cleanerId);
  });
}

export function sortPoolCandidates(candidates: JobPoolCandidate[]) {
  return [...candidates].sort((left, right) => {
    const rankDifference =
      (left.preferredRank ?? Number.MAX_SAFE_INTEGER) -
      (right.preferredRank ?? Number.MAX_SAFE_INTEGER);
    if (rankDifference) return rankDifference;
    const nameDifference = left.cleanerName.localeCompare(
      right.cleanerName,
      "en-AU",
    );
    if (nameDifference) return nameDifference;
    return left.cleanerId.localeCompare(right.cleanerId);
  });
}

export function buildJobSlots(
  {
    assignments,
    crewSize,
    status,
  }: {
    assignments: JobAssignmentRecord[];
    crewSize: number;
    status: JobStatus;
  },
): JobSlot[] {
  return Array.from({ length: crewSize }, (_, index) => {
    const slotNumber = index + 1;
    const slotAssignments = assignments
      .filter((assignment) => assignment.slotNumber === slotNumber)
      .sort((left, right) => right.assignedAt.localeCompare(left.assignedAt));
    const activeAssignment = slotAssignments.find(
      (candidate) => candidate.unassignedAt === null,
    );

    if (activeAssignment) {
      return {
        slotNumber,
        state: "assigned",
        assignment: {
          cleanerId: activeAssignment.cleanerId,
          cleanerName: activeAssignment.cleanerName,
          source: activeAssignment.source,
          assignedAt: activeAssignment.assignedAt,
        },
      };
    }

    const previousAssignment = slotAssignments
      .filter(
        (candidate): candidate is JobAssignmentRecord & { unassignedAt: string } =>
          candidate.unassignedAt !== null,
      )
      .sort((left, right) =>
        right.unassignedAt.localeCompare(left.unassignedAt),
      )[0];
    const previous = previousAssignment
      ? {
          cleanerId: previousAssignment.cleanerId,
          cleanerName: previousAssignment.cleanerName,
          source: previousAssignment.source,
          assignedAt: previousAssignment.assignedAt,
          releasedAt: previousAssignment.unassignedAt,
        }
      : null;

    if (status === "draft" || status === "posted") {
      return {
        slotNumber,
        state: "open",
        previousAssignment: previous,
      };
    }
    return {
      slotNumber,
      state: "closed",
      previousAssignment: previous,
    };
  });
}
