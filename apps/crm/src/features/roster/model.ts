import { getRosterDateKey } from "./calendar";
import type {
  CleanerRosterModel,
  RosterAssignment,
  RosterCellItem,
  RosterCleaner,
  RosterDay,
  RosterJob,
  RosterRow,
  RosterSite,
  RosterVacancy,
  SiteRosterModel,
} from "./types";

type BuildCleanerRosterInput = {
  days: RosterDay[];
  cleaners: RosterCleaner[];
  jobs: RosterJob[];
  assignments: RosterAssignment[];
  vacancies: RosterVacancy[];
};

type BuildSiteRosterInput = BuildCleanerRosterInput & {
  sites: RosterSite[];
};

function emptyCells(days: RosterDay[]) {
  return Object.fromEntries(days.map((day) => [day.dateKey, [] as RosterCellItem[]]));
}

function sortCells(row: RosterRow) {
  for (const items of Object.values(row.cells)) {
    items.sort((left, right) => {
      const scheduleOrder = left.scheduledStart.localeCompare(right.scheduledStart);
      const kindOrder = Number(left.kind === "gap") - Number(right.kind === "gap");
      return scheduleOrder || kindOrder || left.key.localeCompare(right.key);
    });
  }
  return row;
}

function visibleCleanerNames(
  cleaners: RosterCleaner[],
  assignments: RosterAssignment[],
  jobsById: Map<string, RosterJob>,
) {
  const cleanersById = new Map(cleaners.map((cleaner) => [cleaner.id, cleaner]));
  for (const assignment of assignments) {
    if (!cleanersById.has(assignment.cleanerId) && jobsById.has(assignment.jobId)) {
      cleanersById.set(assignment.cleanerId, {
        id: assignment.cleanerId,
        name: "Unavailable cleaner",
      });
    }
  }
  return cleanersById;
}

function assignmentsByJob(
  assignments: RosterAssignment[],
  jobsById: Map<string, RosterJob>,
) {
  const byJob = new Map<string, RosterAssignment[]>();
  for (const assignment of assignments) {
    if (!jobsById.has(assignment.jobId)) continue;
    const jobAssignments = byJob.get(assignment.jobId) ?? [];
    jobAssignments.push(assignment);
    byJob.set(assignment.jobId, jobAssignments);
  }
  for (const jobAssignments of byJob.values()) {
    jobAssignments.sort((left, right) => left.slotNumber - right.slotNumber);
  }
  return byJob;
}

function assignedCleanerNames(
  jobId: string,
  byJob: Map<string, RosterAssignment[]>,
  cleanersById: Map<string, RosterCleaner>,
) {
  return (byJob.get(jobId) ?? []).map(
    (assignment) => cleanersById.get(assignment.cleanerId)?.name ?? "Unavailable cleaner",
  );
}

function modelEvidence(jobs: RosterJob[], vacancies: RosterVacancy[]) {
  return {
    vacancyCount: vacancies.length,
    vacancyKeys: vacancies.map((vacancy) => vacancy.key).sort(),
    jobIds: [...new Set(jobs.map((job) => job.id))].sort(),
  };
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
  const cleanersById = visibleCleanerNames(cleaners, assignments, jobsById);
  const jobAssignments = assignmentsByJob(assignments, jobsById);

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
      cleanerNames: assignedCleanerNames(job.id, jobAssignments, cleanersById),
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
    ...modelEvidence(jobs, vacancies),
  };
}

export function buildSiteRoster({
  days,
  cleaners,
  sites,
  jobs,
  assignments,
  vacancies,
}: BuildSiteRosterInput): SiteRosterModel {
  const visibleDates = new Set(days.map((day) => day.dateKey));
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const cleanersById = visibleCleanerNames(cleaners, assignments, jobsById);
  const jobAssignments = assignmentsByJob(assignments, jobsById);
  const rows = [...sites]
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .map<RosterRow>((site) => ({
      id: `site:${site.id}`,
      label: site.name,
      kind: "site",
      cells: emptyCells(days),
    }));
  const rowsBySiteId = new Map(rows.map((row) => [row.id.replace(/^site:/, ""), row]));

  for (const job of jobs) {
    const row = rowsBySiteId.get(job.siteId);
    if (!row) throw new Error(`Roster job ${job.id} has no visible site row.`);
    const dateKey = getRosterDateKey(job.scheduledStart);
    if (!visibleDates.has(dateKey)) continue;
    row.cells[dateKey]?.push({
      kind: "job",
      key: `job:${job.id}`,
      jobId: job.id,
      siteName: job.siteName,
      scheduledStart: job.scheduledStart,
      crewSize: job.crewSize,
      cleanerNames: assignedCleanerNames(job.id, jobAssignments, cleanersById),
    });
  }

  for (const vacancy of vacancies) {
    const row = rowsBySiteId.get(vacancy.siteId);
    if (!row) throw new Error(`Roster vacancy ${vacancy.key} has no visible site row.`);
    const dateKey = getRosterDateKey(vacancy.scheduledStart);
    if (!visibleDates.has(dateKey)) continue;
    row.cells[dateKey]?.push({
      kind: "gap",
      key: vacancy.key,
      jobId: vacancy.jobId,
      siteName: vacancy.siteName,
      scheduledStart: vacancy.scheduledStart,
      crewSlot: vacancy.crewSlot,
      crewSize: vacancy.crewSize,
    });
  }

  return {
    rows: rows.map(sortCells),
    ...modelEvidence(jobs, vacancies),
  };
}
