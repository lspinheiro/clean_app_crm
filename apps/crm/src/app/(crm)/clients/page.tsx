import { ClientsWorkspace } from "./clients-workspace";

import type { ClientWithSites } from "@/features/clients/types";
import { requireCompanyAdmin } from "@/lib/auth/session";

export default async function ClientsPage() {
  const { supabase } = await requireCompanyAdmin();
  const [{ data: clientRows, error: clientError }, { data: siteRows, error: siteError }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name, contact_name, phone, notes")
        .order("name"),
      supabase
        .from("sites")
        .select("id, client_id, name, address, suburb, access_notes")
        .order("name"),
    ]);
  if (clientError) throw clientError;
  if (siteError) throw siteError;

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
