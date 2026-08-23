import type { AppLocale } from "@/i18n/config";
import { collatorFor } from "@/i18n/intl";

import type { BoardRow, Vacancy } from "./types";

function bySoonestThenName(left: Vacancy, right: Vacancy, locale: AppLocale) {
  const collator = collatorFor(locale);
  const byStart = left.scheduledStart.localeCompare(right.scheduledStart);
  if (byStart) return byStart;

  const byCompany = collator.compare(left.companyName, right.companyName);
  if (byCompany) return byCompany;

  const bySite = collator.compare(left.siteName, right.siteName);
  if (bySite) return bySite;

  return collator.compare(left.jobId, right.jobId);
}

/**
 * The view yields one row per open crew slot, so a two-cleaner job with nothing assigned
 * arrives twice. Collapse to one card per job and count what is still open — repeating an
 * identical card would read as a rendering bug.
 */
export function toVacancies(rows: BoardRow[], locale: AppLocale = "en-AU"): Vacancy[] {
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
      serviceSlug: row.service_slug,
      scheduledStart: row.scheduled_start,
      durationMinutes: row.duration_minutes,
      cleanerPayCents: row.cleaner_pay_cents,
      crewSize: row.crew_size,
      openSlots: 1,
      applicationStatus: row.my_application_status,
    });
  }

  return [...byJob.values()].sort((left, right) => bySoonestThenName(left, right, locale));
}
