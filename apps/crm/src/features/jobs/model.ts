import type {
  JobApplicant,
  JobAssignmentRecord,
  JobPoolCandidate,
  JobSlot,
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
  crewSize: number,
  assignments: JobAssignmentRecord[],
): JobSlot[] {
  return Array.from({ length: crewSize }, (_, index) => {
    const slotNumber = index + 1;
    const slotAssignments = assignments
      .filter((assignment) => assignment.slotNumber === slotNumber)
      .sort((left, right) => right.assignedAt.localeCompare(left.assignedAt));
    const assignment =
      slotAssignments.find((candidate) => candidate.unassignedAt === null) ??
      slotAssignments.sort((left, right) =>
        (right.unassignedAt ?? "").localeCompare(left.unassignedAt ?? ""),
      )[0];

    if (!assignment) {
      return {
        slotNumber,
        state: "open" as const,
        cleanerId: null,
        cleanerName: null,
        source: null,
      };
    }

    return {
      slotNumber,
      state: assignment.unassignedAt === null ? ("assigned" as const) : ("released" as const),
      cleanerId: assignment.cleanerId,
      cleanerName: assignment.cleanerName,
      source: assignment.source,
    };
  });
}
