import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import {
  NewJobForm,
  type NewJobClient,
  type NewJobService,
} from "./new-job-form";

import { requireCompanyAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New job" };

export default async function NewJobPage() {
  const { supabase } = await requireCompanyAdmin();
  const [
    { data: clientRows, error: clientError },
    { data: siteRows, error: siteError },
    { data: serviceRows, error: serviceError },
  ] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase
      .from("sites")
      .select(
        "id, client_id, name, suburb, default_service_id, default_duration_minutes, default_rate_cents",
      )
      .order("name"),
    supabase
      .from("service_catalogue")
      .select("id, name")
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
  const services: NewJobService[] = serviceRows;
  const hasSites = clients.some((client) => client.sites.length > 0);

  return (
    <main className="page-shell new-job-page-shell">
      <Link className="back-link" href="/jobs">
        <ArrowLeft aria-hidden="true" size={18} />
        Back to jobs
      </Link>
      <header className="new-job-page-header">
        <p className="eyebrow">One-off work</p>
        <h1 className="page-heading">Create a job</h1>
        <p className="page-description">
          Start with the site defaults, then tailor the schedule, crew, and agreed amounts.
        </p>
      </header>
      {hasSites && services.length ? (
        <NewJobForm clients={clients} services={services} />
      ) : (
        <section className="records-empty">
          <h2>Set up a client site first</h2>
          <p>
            A job needs a site and an active service before it can be saved.
          </p>
          <Link className="button" href="/clients">
            Open clients &amp; sites
          </Link>
        </section>
      )}
    </main>
  );
}
