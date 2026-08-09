import { getRosterDateKey } from "./calendar";
import type {
  CleanerRosterModel,
  RosterAssignment,
  RosterCellItem,
  RosterCleaner,
  RosterDay,
  RosterJob,
  RosterRow,
  RosterVacancy,
} from "./types";

type BuildCleanerRosterInput = {
  days: RosterDay[];
  cleaners: RosterCleaner[];
  jobs: RosterJob[];
  assignments: RosterAssignment[];
  vacancies: RosterVacancy[];
};

function emptyCells(days: RosterDay[]) {
  return Object.fromEntries(days.map((day) => [day.dateKey, [] as RosterCellItem[]]));
}

function sortCells(row: RosterRow) {
  for (const items of Object.values(row.cells)) {
    items.sort((left, right) => {
      const scheduleOrder = left.scheduledStart.localeCompare(right.scheduledStart);
      return scheduleOrder || left.key.localeCompare(right.key);
    });
  }
  return row;
}

export function buildCleanerRoster({
  days,
  cleaners,
  jobs,
  assignments,
  vacancies,
}: BuildCleanerRosterInput): CleanerRosterModel {
  const visibleDates = new Set(days.map((day) => day.dateKey));
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const cleanersById = new Map(cleaners.map((cleaner) => [cleaner.id, cleaner]));

  for (const assignment of assignments) {
    if (!cleanersById.has(assignment.cleanerId) && jobsById.has(assignment.jobId)) {
      cleanersById.set(assignment.cleanerId, {
        id: assignment.cleanerId,
        name: "Unavailable cleaner",
      });
    }
  }

  const cleanerRows = [...cleanersById.values()]
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .map<RosterRow>((cleaner) => ({
      id: `cleaner:${cleaner.id}`,
      label: cleaner.name,
      kind: "cleaner",
      cells: emptyCells(days),
    }));
  const rowsByCleanerId = new Map(
    cleanerRows.map((row) => [row.id.replace(/^cleaner:/, ""), row]),
  );

  for (const assignment of assignments) {
    const job = jobsById.get(assignment.jobId);
    const row = rowsByCleanerId.get(assignment.cleanerId);
    if (!job || !row) continue;
    const dateKey = getRosterDateKey(job.scheduledStart);
    if (!visibleDates.has(dateKey)) continue;
    row.cells[dateKey]?.push({
      kind: "job",
      key: `job:${job.id}:${assignment.cleanerId}`,
      jobId: job.id,
      siteName: job.siteName,
      scheduledStart: job.scheduledStart,
      crewSize: job.crewSize,
    });
  }

  const rows: RosterRow[] = [];
  if (vacancies.length > 0) {
    const gapRow: RosterRow = {
      id: "gaps",
      label: "Unfilled slots",
      kind: "gaps",
      cells: emptyCells(days),
    };
    for (const vacancy of vacancies) {
      const dateKey = getRosterDateKey(vacancy.scheduledStart);
      if (!visibleDates.has(dateKey)) continue;
      gapRow.cells[dateKey]?.push({
        kind: "gap",
        key: vacancy.key,
        jobId: vacancy.jobId,
        siteName: vacancy.siteName,
        scheduledStart: vacancy.scheduledStart,
        crewSlot: vacancy.crewSlot,
        crewSize: vacancy.crewSize,
      });
    }
    rows.push(sortCells(gapRow));
  }
  rows.push(...cleanerRows.map(sortCells));

  return {
    rows,
    vacancyCount: vacancies.length,
    vacancyKeys: vacancies.map((vacancy) => vacancy.key).sort(),
    jobIds: [...new Set(jobs.map((job) => job.id))].sort(),
  };
}
