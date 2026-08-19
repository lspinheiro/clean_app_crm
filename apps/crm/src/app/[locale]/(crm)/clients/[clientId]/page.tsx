import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { ClientDetailWorkspace } from "./client-detail-workspace";

import type {
  ClientWithSites,
  PoolCleaner,
  ServiceOption,
} from "@/features/clients/types";
import type { RecurringAssignmentsBySite } from "@/features/recurring-assignments/types";
import { getServiceLabel } from "@/i18n/service-label";
import { requireCompanyAdmin } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("clientDetail") };
}

type ClientDetailPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const common = await getTranslations("Common");
  const serviceT = await getTranslations("Services");
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
      .select("id, name, slug")
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
    { data: recurringRows, error: recurringError },
  ] = await Promise.all([
    memberIds.length
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", memberIds)
          .order("full_name")
      : Promise.resolve({ data: [], error: null }),
    siteIds.length
      ? supabase
          .from("site_preferred_cleaners")
          .select("site_id, cleaner_id, rank")
          .in("site_id", siteIds)
          .order("rank")
      : Promise.resolve({ data: [], error: null }),
    siteIds.length
      ? supabase
          .from("recurring_assignments")
          .select(
            "id, site_id, service_id, frequency, weekday, anchor_date, local_start_time, duration_minutes, cleaner_pay_cents, crew_size, active",
          )
          .in("site_id", siteIds)
          .order("weekday")
          .order("local_start_time")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileError) throw profileError;
  if (preferenceError) throw preferenceError;
  if (recurringError) throw recurringError;

  const recurringIds = recurringRows.map((rule) => rule.id);
  const { data: namedCleanerRows, error: namedCleanerError } = recurringIds.length
    ? await supabase
        .from("recurring_assignment_cleaners")
        .select("recurring_assignment_id, slot_number, cleaner_id")
        .in("recurring_assignment_id", recurringIds)
        .order("slot_number")
    : { data: [], error: null };
  if (namedCleanerError) throw namedCleanerError;

  const services: ServiceOption[] = serviceRows.map((service) => ({
    id: service.id,
    name: getServiceLabel(service, serviceT),
  }));
  const poolCleaners: PoolCleaner[] = profileRows.map((profile) => ({
    id: profile.id,
    name: profile.full_name,
  }));
  const recurringAssignmentsBySite: RecurringAssignmentsBySite = Object.fromEntries(
    siteIds.map((siteId) => [
      siteId,
      recurringRows
        .filter((rule) => rule.site_id === siteId)
        .map((rule) => ({
          id: rule.id,
          siteId: rule.site_id,
          service: services.find((service) => service.id === rule.service_id) ?? {
            id: rule.service_id,
            name: common("unknownService"),
          },
          frequency: rule.frequency,
          weekday: rule.weekday,
          anchorDate: rule.anchor_date,
          startTime: rule.local_start_time,
          durationMinutes: rule.duration_minutes,
          cleanerPayCents: rule.cleaner_pay_cents,
          crewSize: rule.crew_size,
          active: rule.active,
          namedCleaners: namedCleanerRows
            .filter((named) => named.recurring_assignment_id === rule.id)
            .map((named) => ({
              id: named.cleaner_id,
              name:
                poolCleaners.find((cleaner) => cleaner.id === named.cleaner_id)?.name ??
                common("unknownCleaner"),
              slotNumber: named.slot_number,
            })),
        })),
    ]),
  );
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
            common("unknownCleaner"),
          rank: preference.rank,
        })),
    })),
  };

  return (
    <main className="page-shell client-detail-shell">
      <ClientDetailWorkspace
        client={client}
        poolCleaners={poolCleaners}
        recurringAssignmentsBySite={recurringAssignmentsBySite}
        services={services}
      />
    </main>
  );
}
