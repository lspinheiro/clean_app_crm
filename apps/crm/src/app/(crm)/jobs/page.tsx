import type { Metadata } from "next";

import { JobsList } from "./jobs-list";

import type { JobSummary } from "@/features/jobs/types";
import { requireCompanyAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage() {
  const { supabase } = await requireCompanyAdmin();
  const [
    { data: jobRows, error: jobError },
    { data: assignmentRows, error: assignmentError },
    { data: siteRows, error: siteError },
    { data: clientRows, error: clientError },
    { data: serviceRows, error: serviceError },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, site_id, service_id, scheduled_start, duration_minutes, cleaner_pay_cents, status, crew_size",
      )
      .order("scheduled_start"),
    supabase
      .from("job_assignments")
      .select("job_id, unassigned_at")
      .is("unassigned_at", null),
    supabase.from("sites").select("id, client_id, name"),
    supabase.from("clients").select("id, name"),
    supabase.from("service_catalogue").select("id, name"),
  ]);
  if (jobError) throw jobError;
  if (assignmentError) throw assignmentError;
  if (siteError) throw siteError;
  if (clientError) throw clientError;
  if (serviceError) throw serviceError;

  const sitesById = new Map(siteRows.map((site) => [site.id, site]));
  const clientsById = new Map(clientRows.map((client) => [client.id, client]));
  const servicesById = new Map(serviceRows.map((service) => [service.id, service]));
  const jobs: JobSummary[] = jobRows.map((job) => {
    const site = sitesById.get(job.site_id);
    const client = site ? clientsById.get(site.client_id) : null;
    return {
      id: job.id,
      siteName: site?.name ?? "Unknown site",
      clientName: client?.name ?? "Unknown client",
      serviceName: servicesById.get(job.service_id)?.name ?? "Unknown service",
      scheduledStart: job.scheduled_start,
      durationMinutes: job.duration_minutes,
      cleanerPayCents: job.cleaner_pay_cents,
      status: job.status,
      crewSize: job.crew_size,
      assignedSlots: assignmentRows.filter(
        (assignment) => assignment.job_id === job.id,
      ).length,
    };
  });

  return (
    <main className="page-shell jobs-page-shell">
      <header className="jobs-page-header">
        <div>
          <h1 className="page-heading">Jobs</h1>
          <p className="page-description">
            Every scheduled clean, its staffing state, and the pay agreed per crew slot.
          </p>
        </div>
        <p className="jobs-count tabular-numerals">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
        </p>
      </header>
      <JobsList jobs={jobs} />
    </main>
  );
}
