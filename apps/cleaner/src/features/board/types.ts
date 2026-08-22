/** `public.application_status` — the complete visible lifecycle of an application. */
export type ApplicationStatus = "applied" | "assigned" | "not_selected" | "withdrawn";

/** One row of `cleaner_job_board` — the view yields one row per *open* crew slot. */
export type BoardRow = {
  job_id: string;
  company_name: string;
  site_name: string;
  suburb: string;
  service_name: string;
  service_slug: string | null;
  scheduled_start: string;
  duration_minutes: number;
  cleaner_pay_cents: number;
  crew_size: number;
  crew_slot: number;
  /** Her own application on this job, if she has ever made one. */
  my_application_status: ApplicationStatus | null;
};

/** One job with open work, however many of its crew slots are still unfilled. */
export type Vacancy = {
  jobId: string;
  companyName: string;
  siteName: string;
  suburb: string;
  serviceName: string;
  serviceSlug: string | null;
  scheduledStart: string;
  durationMinutes: number;
  cleanerPayCents: number;
  crewSize: number;
  openSlots: number;
  applicationStatus: ApplicationStatus | null;
};
