import { notFound } from "next/navigation";
import { z } from "zod";

import { ClientDetailWorkspace } from "./client-detail-workspace";

import type {
  ClientWithSites,
  ServiceOption,
} from "@/features/clients/types";
import { requireCompanyAdmin } from "@/lib/auth/session";

type ClientDetailPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { clientId } = await params;
  if (!z.string().uuid().safeParse(clientId).success) notFound();

  const { supabase } = await requireCompanyAdmin();
  const [
    { data: clientRow, error: clientError },
    { data: siteRows, error: siteError },
    { data: serviceRows, error: serviceError },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, contact_name, phone, notes")
      .eq("id", clientId)
      .maybeSingle(),
    supabase
      .from("sites")
      .select(
        "id, client_id, name, address, suburb, access_notes, default_service_id, default_duration_minutes, default_rate_cents",
      )
      .eq("client_id", clientId)
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
  if (!clientRow) notFound();

  const services: ServiceOption[] = serviceRows;
  const client: ClientWithSites = {
    id: clientRow.id,
    name: clientRow.name,
    contactName: clientRow.contact_name,
    phone: clientRow.phone,
    notes: clientRow.notes,
    sites: siteRows.map((site) => ({
      id: site.id,
      clientId: site.client_id,
      name: site.name,
      address: site.address,
      suburb: site.suburb,
      accessNotes: site.access_notes,
      defaultService:
        services.find((service) => service.id === site.default_service_id) ?? null,
      defaultDurationMinutes: site.default_duration_minutes,
      defaultRateCents: site.default_rate_cents,
    })),
  };

  return (
    <main className="page-shell client-detail-shell">
      <ClientDetailWorkspace client={client} services={services} />
    </main>
  );
}
