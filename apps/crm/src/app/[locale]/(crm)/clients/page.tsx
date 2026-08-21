import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ClientsWorkspace } from "./clients-workspace";

import type { ClientWithSites } from "@/features/clients/types";
import { getServiceLabel } from "@/i18n/service-label";
import { requireCompanyAdmin } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("clients") };
}

export default async function ClientsPage() {
  const t = await getTranslations("Clients");
  const serviceT = await getTranslations("Services");
  const { company, supabase } = await requireCompanyAdmin();
  const [
    { data: clientRows, error: clientError },
    { data: siteRows, error: siteError },
    { data: serviceRows, error: serviceError },
  ] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, contact_name, phone, notes")
        .eq("company_id", company.id)
        .order("name"),
      supabase
        .from("sites")
        .select(
          "id, client_id, name, address, suburb, access_notes, default_service_id, default_duration_minutes, default_rate_cents, clients!inner(company_id)",
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

  const clients: ClientWithSites[] = clientRows.map((client) => ({
    id: client.id,
    name: client.name,
    contactName: client.contact_name,
    phone: client.phone,
    notes: client.notes,
    sites: siteRows
      .filter((site) => site.client_id === client.id)
      .map((site) => ({
        id: site.id,
        clientId: site.client_id,
        name: site.name,
        address: site.address,
        suburb: site.suburb,
        accessNotes: site.access_notes,
        defaultService:
          (() => {
            const service = serviceRows.find(
              (candidate) => candidate.id === site.default_service_id,
            );
            return service
              ? { id: service.id, name: getServiceLabel(service, serviceT) }
              : null;
          })(),
        defaultDurationMinutes: site.default_duration_minutes,
        defaultRateCents: site.default_rate_cents,
        preferredCleaners: [],
      })),
  }));

  return (
    <main className="page-shell">
      <header className="page-header-row clients-page-header">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="page-heading">{t("title")}</h1>
          <p className="page-description">{t("description")}</p>
        </div>
      </header>
      <ClientsWorkspace clients={clients} />
    </main>
  );
}
