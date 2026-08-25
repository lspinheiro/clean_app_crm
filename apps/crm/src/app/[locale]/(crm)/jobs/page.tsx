import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { JobsList } from "./jobs-list";

import type { JobSummary } from "@/features/jobs/types";
import { getServiceLabel } from "@/i18n/service-label";
import { Link } from "@/i18n/navigation";
import { requireCompanyAdmin } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("jobs") };
}

export default async function JobsPage() {
  const t = await getTranslations("Jobs");
  const common = await getTranslations("Common");
  const services = await getTranslations("Services");
  const { company, supabase } = await requireCompanyAdmin();
  const [
    { data: jobRows, error: jobError },
    { data: assignmentRows, error: assignmentError },
    { data: applicationRows, error: applicationError },
    { data: siteRows, error: siteError },
    { data: clientRows, error: clientError },
    { data: serviceRows, error: serviceError },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, site_id, service_id, scheduled_start, duration_minutes, cleaner_pay_cents, status, crew_size, sites!inner(clients!inner(company_id))",
      )
      .eq("sites.clients.company_id", company.id)
      .order("scheduled_start"),
    supabase
      .from("job_assignments")
      .select("job_id, unassigned_at, jobs!inner(sites!inner(clients!inner(company_id)))")
      .eq("jobs.sites.clients.company_id", company.id)
      .is("unassigned_at", null),
    supabase
      .from("job_applications")
      .select("job_id, jobs!inner(sites!inner(clients!inner(company_id)))")
      .eq("jobs.sites.clients.company_id", company.id)
      .eq("status", "applied"),
    supabase
      .from("sites")
      .select("id, client_id, name, clients!inner(company_id)")
      .eq("clients.company_id", company.id),
    supabase.from("clients").select("id, name").eq("company_id", company.id),
    supabase.from("service_catalogue").select("id, name, slug"),
  ]);
  if (jobError) throw jobError;
  if (assignmentError) throw assignmentError;
  if (applicationError) throw applicationError;
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
      siteName: site?.name ?? common("unknownSite"),
      clientName: client?.name ?? common("unknownClient"),
      serviceName: servicesById.has(job.service_id)
        ? getServiceLabel(servicesById.get(job.service_id)!, services)
        : common("unknownService"),
      scheduledStart: job.scheduled_start,
      durationMinutes: job.duration_minutes,
      cleanerPayCents: job.cleaner_pay_cents,
      status: job.status,
      crewSize: job.crew_size,
      assignedSlots: assignmentRows.filter(
        (assignment) => assignment.job_id === job.id,
      ).length,
      awaitingApplications: applicationRows.filter(
        (application) => application.job_id === job.id,
      ).length,
    };
  });

  return (
    <main className="page-shell jobs-page-shell">
      <header className="jobs-page-header">
        <div>
          <h1 className="page-heading">{t("title")}</h1>
          <p className="page-description">{t("description")}</p>
        </div>
        <div className="jobs-page-actions">
          <p className="jobs-count tabular-numerals">
            {t("count", { count: jobs.length })}
          </p>
          <Link className="button" href="/jobs/new">
            <Plus aria-hidden="true" size={18} />
            {t("newJob")}
          </Link>
        </div>
      </header>
      <JobsList jobs={jobs} />
    </main>
  );
}
