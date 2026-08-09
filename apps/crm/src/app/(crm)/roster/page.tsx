import { RosterWeek } from "./roster-week";

import {
  buildRosterDays,
  getRosterWeekBounds,
  parseRosterView,
  parseRosterWeek,
} from "@/features/roster/calendar";
import { buildCleanerRoster, buildSiteRoster } from "@/features/roster/model";
import type {
  RosterAssignment,
  RosterCleaner,
  RosterJob,
  RosterSite,
  RosterVacancy,
} from "@/features/roster/types";
import { requireCompanyAdmin } from "@/lib/auth/session";

type RosterPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const visibleJobStatuses = [
  "posted",
  "assigned",
  "on_the_way",
  "in_progress",
  "completed",
] as const;

export default async function RosterPage({ searchParams }: RosterPageProps) {
  const [{ view: requestedView, week }, { company, supabase }] = await Promise.all([
    searchParams,
    requireCompanyAdmin(),
  ]);
  const view = parseRosterView(requestedView);
  const weekStart = parseRosterWeek(week);
  const days = buildRosterDays(weekStart);
  const { startsAt, endsAt } = getRosterWeekBounds(weekStart);

  const [clientsResult, membershipsResult, vacanciesResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("company_id", company.id)
      .order("name")
      .order("id"),
    supabase
      .from("company_members")
      .select("profile_id")
      .eq("company_id", company.id)
      .eq("status", "active"),
    supabase
      .from("vacancies")
      .select(
        "job_id, company_id, site_id, site_name, scheduled_start, crew_slot, crew_size",
        { count: "exact" },
      )
      .eq("company_id", company.id)
      .gte("scheduled_start", startsAt)
      .lt("scheduled_start", endsAt)
      .order("scheduled_start")
      .order("job_id")
      .order("crew_slot"),
  ]);
  if (clientsResult.error) throw clientsResult.error;
  if (membershipsResult.error) throw membershipsResult.error;
  if (vacanciesResult.error) throw vacanciesResult.error;
  if (
    vacanciesResult.count !== null
    && vacanciesResult.count !== vacanciesResult.data.length
  ) {
    throw new Error("The weekly vacancy result exceeded the roster query page size.");
  }

  const clientIds = clientsResult.data.map((client) => client.id);
  const memberIds = membershipsResult.data.map((membership) => membership.profile_id);
  const [sitesResult, profilesResult] = await Promise.all([
    clientIds.length
      ? supabase
          .from("sites")
          .select("id, client_id, name")
          .in("client_id", clientIds)
          .order("name")
          .order("id")
      : Promise.resolve({ data: [], error: null }),
    memberIds.length
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", memberIds)
          .eq("role", "cleaner")
          .order("full_name")
          .order("id")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sitesResult.error) throw sitesResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const siteIds = sitesResult.data.map((site) => site.id);
  const jobsResult = siteIds.length
    ? await supabase
        .from("jobs")
        .select("id, site_id, scheduled_start, crew_size, status")
        .in("site_id", siteIds)
        .gte("scheduled_start", startsAt)
        .lt("scheduled_start", endsAt)
        .in("status", [...visibleJobStatuses])
        .order("scheduled_start")
        .order("id")
    : { data: [], error: null };
  if (jobsResult.error) throw jobsResult.error;

  const jobIds = jobsResult.data.map((job) => job.id);
  const assignmentsResult = jobIds.length
    ? await supabase
        .from("job_assignments")
        .select("job_id, cleaner_id, slot_number")
        .in("job_id", jobIds)
        .is("unassigned_at", null)
        .order("job_id")
        .order("slot_number")
    : { data: [], error: null };
  if (assignmentsResult.error) throw assignmentsResult.error;

  const siteNames = new Map(sitesResult.data.map((site) => [site.id, site.name]));
  const jobs: RosterJob[] = jobsResult.data.map((job) => {
    const siteName = siteNames.get(job.site_id);
    if (!siteName) throw new Error(`Roster job ${job.id} has no visible site.`);
    return {
      id: job.id,
      siteId: job.site_id,
      siteName,
      scheduledStart: job.scheduled_start,
      crewSize: job.crew_size,
    };
  });
  const assignments: RosterAssignment[] = assignmentsResult.data.map((assignment) => ({
    jobId: assignment.job_id,
    cleanerId: assignment.cleaner_id,
    slotNumber: assignment.slot_number,
  }));
  const cleaners: RosterCleaner[] = profilesResult.data.map((profile) => ({
    id: profile.id,
    name: profile.full_name,
  }));
  const clientNames = new Map(clientsResult.data.map((client) => [client.id, client.name]));
  const sites: RosterSite[] = sitesResult.data.map((site) => {
    const clientName = clientNames.get(site.client_id);
    if (!clientName) throw new Error(`Roster site ${site.id} has no visible client.`);
    return {
      id: site.id,
      name: site.name,
      clientName,
    };
  });
  const vacancies: RosterVacancy[] = vacanciesResult.data.map((vacancy) => {
    if (
      !vacancy.job_id
      || !vacancy.site_id
      || !vacancy.site_name
      || !vacancy.scheduled_start
      || vacancy.crew_slot === null
      || vacancy.crew_size === null
    ) {
      throw new Error("The vacancy view returned an incomplete roster row.");
    }
    return {
      key: `${vacancy.job_id}:${vacancy.crew_slot}`,
      jobId: vacancy.job_id,
      siteId: vacancy.site_id,
      siteName: vacancy.site_name,
      scheduledStart: vacancy.scheduled_start,
      crewSlot: vacancy.crew_slot,
      crewSize: vacancy.crew_size,
    };
  });

  const rosterInput = { days, cleaners, jobs, assignments, vacancies };
  const model = view === "site"
    ? buildSiteRoster({ ...rosterInput, sites })
    : buildCleanerRoster(rosterInput);
  return (
    <RosterWeek
      days={days}
      hasFoundation={sitesResult.data.length > 0 || cleaners.length > 0 || jobs.length > 0}
      model={model}
      view={view}
      weekStart={weekStart}
    />
  );
}
