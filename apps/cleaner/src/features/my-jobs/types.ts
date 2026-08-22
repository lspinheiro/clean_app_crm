/** `public.job_status` — the complete job lifecycle. */
export type JobStatus =
  | "draft"
  | "posted"
  | "assigned"
  | "on_the_way"
  | "in_progress"
  | "completed"
  | "cancelled";

/**
 * One row of `cleaner_my_jobs` — one active assignment of hers. The view carries no
 * address and no access notes at all; those come from `get_cleaner_job_access`, and only
 * after an explicit tap.
 */
export type MyJobRow = {
  assignment_id: string;
  job_id: string;
  slot_number: number;
  company_name: string;
  site_name: string;
  suburb: string;
  service_name: string;
  service_slug: string | null;
  status: JobStatus;
  scheduled_start: string;
  duration_minutes: number;
  cleaner_pay_cents: number;
};

/** One job she is on. */
export type MyJob = {
  assignmentId: string;
  jobId: string;
  slotNumber: number;
  companyName: string;
  siteName: string;
  suburb: string;
  serviceName: string;
  serviceSlug: string | null;
  status: JobStatus;
  scheduledStart: string;
  durationMinutes: number;
  cleanerPayCents: number;
};
