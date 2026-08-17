import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  NewJobForm,
  type NewJobClient,
  type NewJobService,
} from "./new-job-form";

import { requireCompanyAdmin } from "@/lib/auth/session";
import { Link } from "@/i18n/navigation";
import { getServiceLabel } from "@/i18n/service-label";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("newJob") };
}

export default async function NewJobPage() {
  const t = await getTranslations("Jobs");
  const serviceT = await getTranslations("Services");
  const { company, supabase } = await requireCompanyAdmin();
  const [
    { data: clientRows, error: clientError },
    { data: siteRows, error: siteError },
    { data: serviceRows, error: serviceError },
  ] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
      .eq("company_id", company.id)
      .order("name"),
    supabase
      .from("sites")
      .select(
        "id, client_id, name, suburb, default_service_id, default_duration_minutes, default_rate_cents, clients!inner(company_id)",
      )
      .eq("clients.company_id", company.id)
      .order("name"),
      supabase
        .from("service_catalogue")
        .select("id, name, slug")
      .eq("active", true)
      .order("sort_order"),
  ]);
  if (clientError) throw clientError;
  if (siteError) throw siteError;
  if (serviceError) throw serviceError;

  const clients: NewJobClient[] = clientRows.map((client) => ({
    id: client.id,
    name: client.name,
    sites: siteRows
      .filter((site) => site.client_id === client.id)
      .map((site) => ({
        id: site.id,
        name: site.name,
        suburb: site.suburb,
        defaultServiceId: site.default_service_id,
        defaultDurationMinutes: site.default_duration_minutes,
        defaultRateCents: site.default_rate_cents,
      })),
  }));
  const services: NewJobService[] = serviceRows.map((service) => ({
    id: service.id,
    name: getServiceLabel(service, serviceT),
  }));
  const hasSites = clients.some((client) => client.sites.length > 0);

  return (
    <main className="page-shell new-job-page-shell">
      <Link className="back-link" href="/jobs">
        <ArrowLeft aria-hidden="true" size={18} />
        {t("back")}
      </Link>
      <header className="new-job-page-header">
        <p className="eyebrow">{t("oneOff")}</p>
        <h1 className="page-heading">{t("createTitle")}</h1>
        <p className="page-description">{t("createDescription")}</p>
      </header>
      {hasSites && services.length ? (
        <NewJobForm clients={clients} services={services} />
      ) : (
        <section className="records-empty">
          <h2>{t("setupSiteTitle")}</h2>
          <p>{t("setupSiteDescription")}</p>
          <Link className="button" href="/clients">
            {t("openClients")}
          </Link>
        </section>
      )}
    </main>
  );
}
