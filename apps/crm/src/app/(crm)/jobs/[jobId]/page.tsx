import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { JobDetailWorkspace } from "./job-detail-workspace";

import { buildJobSlots, sortJobApplicants, sortPoolCandidates } from "@/features/jobs/model";
import type {
  JobApplicant,
  JobAssignmentRecord,
  JobDetail,
  JobPoolCandidate,
} from "@/features/jobs/types";
import { getServiceLabel } from "@/i18n/service-label";
import { requireCompanyAdmin } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("jobDetail") };
}

type JobDetailPageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const serviceT = await getTranslations("Services");
  const { jobId } = await params;
  if (!z.string().uuid().safeParse(jobId).success) notFound();

  const { company, supabase } = await requireCompanyAdmin();
  const { data: jobRow, error: jobError } = await supabase
    .from("jobs")
    .select(
      "id, status, scheduled_start, duration_minutes, cleaner_pay_cents, client_charge_cents, notes, crew_size, site_id, service_id, sites!inner(id, name, address, suburb, access_notes, clients!inner(id, name, company_id)), service_catalogue!inner(name, slug)",
    )
    .eq("id", jobId)
    .eq("sites.clients.company_id", company.id)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!jobRow) notFound();

  const [
    { data: assignmentRows, error: assignmentError },
    { data: applicationRows, error: applicationError },
    { data: membershipRows, error: membershipError },
    { data: preferenceRows, error: preferenceError },
  ] = await Promise.all([
    supabase
      .from("job_assignments")
      .select(
        "cleaner_id, slot_number, source, assigned_at, unassigned_at, profiles!inner(full_name)",
      )
      .eq("job_id", jobId)
      .order("assigned_at"),
    supabase
      .from("job_applications")
      .select(
        "cleaner_id, status, applied_at, profiles!inner(full_name)",
      )
      .eq("job_id", jobId)
      .order("applied_at"),
    supabase
      .from("company_members")
      .select("profile_id, profiles!inner(id, full_name, role)")
      .eq("company_id", company.id)
      .eq("status", "active")
      .eq("profiles.role", "cleaner"),
    supabase
      .from("site_preferred_cleaners")
      .select("cleaner_id, rank")
      .eq("site_id", jobRow.site_id)
      .order("rank"),
  ]);
  if (assignmentError) throw assignmentError;
  if (applicationError) throw applicationError;
  if (membershipError) throw membershipError;
  if (preferenceError) throw preferenceError;

  const preferredRanks = new Map(
    preferenceRows.map((preference) => [preference.cleaner_id, preference.rank]),
  );
  const assignments: JobAssignmentRecord[] = assignmentRows.map((assignment) => ({
    cleanerId: assignment.cleaner_id,
    cleanerName: assignment.profiles.full_name,
    slotNumber: assignment.slot_number,
    source: assignment.source,
    assignedAt: assignment.assigned_at,
    unassignedAt: assignment.unassigned_at,
  }));
  const activeCleanerIds = new Set(
    assignments
      .filter((assignment) => assignment.unassignedAt === null)
      .map((assignment) => assignment.cleanerId),
  );
  const applicants: JobApplicant[] = sortJobApplicants(
    applicationRows.map((application) => ({
      cleanerId: application.cleaner_id,
      cleanerName: application.profiles.full_name,
      status: application.status,
      appliedAt: application.applied_at,
      preferredRank: preferredRanks.get(application.cleaner_id) ?? null,
    })),
  );
  const poolCandidates: JobPoolCandidate[] = sortPoolCandidates(
    membershipRows
      .filter((membership) => !activeCleanerIds.has(membership.profile_id))
      .map((membership) => ({
        cleanerId: membership.profile_id,
        cleanerName: membership.profiles.full_name,
        preferredRank: preferredRanks.get(membership.profile_id) ?? null,
      })),
  );
  const job: JobDetail = {
    id: jobRow.id,
    status: jobRow.status,
    scheduledStart: jobRow.scheduled_start,
    durationMinutes: jobRow.duration_minutes,
    cleanerPayCents: jobRow.cleaner_pay_cents,
    clientChargeCents: jobRow.client_charge_cents,
    notes: jobRow.notes,
    crewSize: jobRow.crew_size,
    clientName: jobRow.sites.clients.name,
    serviceName: getServiceLabel(jobRow.service_catalogue, serviceT),
    site: {
      id: jobRow.sites.id,
      name: jobRow.sites.name,
      address: jobRow.sites.address,
      suburb: jobRow.sites.suburb,
      accessNotes: jobRow.sites.access_notes,
    },
    slots: buildJobSlots({
      assignments,
      crewSize: jobRow.crew_size,
      status: jobRow.status,
    }),
    applicants,
    poolCandidates,
  };

  return (
    <main className="page-shell job-detail-page-shell">
      <JobDetailWorkspace job={job} />
    </main>
  );
}
