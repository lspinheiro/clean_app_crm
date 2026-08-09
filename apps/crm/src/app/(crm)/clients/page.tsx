import { ClientsWorkspace } from "./clients-workspace";

import type { ClientWithSites } from "@/features/clients/types";
import { requireCompanyAdmin } from "@/lib/auth/session";

export default async function ClientsPage() {
  const { supabase } = await requireCompanyAdmin();
  const [
    { data: clientRows, error: clientError },
    { data: siteRows, error: siteError },
    { data: serviceRows, error: serviceError },
  ] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, contact_name, phone, notes")
        .order("name"),
      supabase
        .from("sites")
        .select(
          "id, client_id, name, address, suburb, access_notes, default_service_id, default_duration_minutes, default_rate_cents",
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
          serviceRows.find((service) => service.id === site.default_service_id) ?? null,
        defaultDurationMinutes: site.default_duration_minutes,
        defaultRateCents: site.default_rate_cents,
        preferredCleaners: [],
      })),
  }));

  return (
    <main className="page-shell">
      <header className="page-header-row clients-page-header">
        <div>
          <p className="eyebrow">Company records</p>
          <h1 className="page-heading">Clients &amp; sites</h1>
          <p className="page-description">
            Keep every commercial relationship and cleaning location in one operational view.
          </p>
        </div>
      </header>
      <ClientsWorkspace clients={clients} />
    </main>
  );
}
