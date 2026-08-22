import type { AppLocale } from "@/i18n/config";

import type { MyJob, MyJobRow } from "./types";

function bySoonestThenSite(left: MyJob, right: MyJob, locale: AppLocale) {
  const byStart = left.scheduledStart.localeCompare(right.scheduledStart);
  if (byStart) return byStart;

  const bySite = left.siteName.localeCompare(right.siteName, locale);
  if (bySite) return bySite;

  return left.jobId.localeCompare(right.jobId);
}

/**
 * The view yields one row per assignment, so there is no per-slot collapsing to do here —
 * unlike the board, one row is one card.
 */
export function toMyJobs(rows: MyJobRow[], locale: AppLocale = "en-AU"): MyJob[] {
  return rows
    .map((row) => ({
      assignmentId: row.assignment_id,
      jobId: row.job_id,
      slotNumber: row.slot_number,
      companyName: row.company_name,
      siteName: row.site_name,
      suburb: row.suburb,
      serviceName: row.service_name,
      serviceSlug: row.service_slug,
      status: row.status,
      scheduledStart: row.scheduled_start,
      durationMinutes: row.duration_minutes,
      cleanerPayCents: row.cleaner_pay_cents,
    }))
    .sort((left, right) => bySoonestThenSite(left, right, locale));
}
