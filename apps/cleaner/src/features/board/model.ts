import type { BoardRow, Vacancy } from "./types";

function bySoonestThenName(left: Vacancy, right: Vacancy) {
  const byStart = left.scheduledStart.localeCompare(right.scheduledStart);
  if (byStart) return byStart;

  const byCompany = left.companyName.localeCompare(right.companyName, "en-AU");
  if (byCompany) return byCompany;

  const bySite = left.siteName.localeCompare(right.siteName, "en-AU");
  if (bySite) return bySite;

  return left.jobId.localeCompare(right.jobId);
}

/**
 * The view yields one row per open crew slot, so a two-cleaner job with nothing assigned
 * arrives twice. Collapse to one card per job and count what is still open — repeating an
 * identical card would read as a rendering bug.
 */
export function toVacancies(rows: BoardRow[]): Vacancy[] {
  const byJob = new Map<string, Vacancy>();

  for (const row of rows) {
    const seen = byJob.get(row.job_id);
    if (seen) {
      seen.openSlots += 1;
      continue;
    }

    byJob.set(row.job_id, {
      jobId: row.job_id,
      companyName: row.company_name,
      siteName: row.site_name,
      suburb: row.suburb,
      serviceName: row.service_name,
      scheduledStart: row.scheduled_start,
      durationMinutes: row.duration_minutes,
      cleanerPayCents: row.cleaner_pay_cents,
      crewSize: row.crew_size,
      openSlots: 1,
      applicationStatus: row.my_application_status,
    });
  }

  return [...byJob.values()].sort(bySoonestThenName);
}
