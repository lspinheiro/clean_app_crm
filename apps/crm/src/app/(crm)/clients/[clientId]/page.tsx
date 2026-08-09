import { notFound } from "next/navigation";
import { z } from "zod";

import { ClientDetailWorkspace } from "./client-detail-workspace";

import type {
  ClientWithSites,
  PoolCleaner,
  ServiceOption,
} from "@/features/clients/types";
import { requireCompanyAdmin } from "@/lib/auth/session";

type ClientDetailPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { clientId } = await params;
  if (!z.string().uuid().safeParse(clientId).success) notFound();

  const { company, supabase } = await requireCompanyAdmin();
  const [
    { data: clientRow, error: clientError },
    { data: siteRows, error: siteError },
    { data: serviceRows, error: serviceError },
    { data: membershipRows, error: membershipError },
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
    supabase
      .from("company_members")
      .select("profile_id")
      .eq("company_id", company.id)
      .eq("status", "active"),
  ]);
  if (clientError) throw clientError;
  if (siteError) throw siteError;
  if (serviceError) throw serviceError;
  if (membershipError) throw membershipError;
  if (!clientRow) notFound();

  const memberIds = membershipRows.map((membership) => membership.profile_id);
  const siteIds = siteRows.map((site) => site.id);
  const [
    { data: profileRows, error: profileError },
    { data: preferenceRows, error: preferenceError },
  ] = await Promise.all([
    memberIds.length
      ? supabase
          .from("profiles")
          .select("id, full_name, role")
          .in("id", memberIds)
          .eq("role", "cleaner")
          .order("full_name")
      : Promise.resolve({ data: [], error: null }),
    siteIds.length
      ? supabase
          .from("site_preferred_cleaners")
          .select("site_id, cleaner_id, rank")
          .in("site_id", siteIds)
          .order("rank")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileError) throw profileError;
  if (preferenceError) throw preferenceError;

  const services: ServiceOption[] = serviceRows;
  const poolCleaners: PoolCleaner[] = profileRows.map((profile) => ({
    id: profile.id,
    name: profile.full_name,
  }));
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
      preferredCleaners: preferenceRows
        .filter((preference) => preference.site_id === site.id)
        .map((preference) => ({
          id: preference.cleaner_id,
          name:
            poolCleaners.find((cleaner) => cleaner.id === preference.cleaner_id)?.name ??
            "Unavailable cleaner",
          rank: preference.rank,
        })),
    })),
  };

  return (
    <main className="page-shell client-detail-shell">
      <ClientDetailWorkspace
        client={client}
        poolCleaners={poolCleaners}
        services={services}
      />
    </main>
  );
}
