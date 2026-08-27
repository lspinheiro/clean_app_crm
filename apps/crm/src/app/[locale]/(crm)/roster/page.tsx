import { getLocale, getTranslations } from "next-intl/server";

import { RosterWeek } from "./roster-week";

import {
  buildRosterDays,
  formatRosterTitle,
  getBrisbaneDateKey,
  getRosterWeekBounds,
  parseRosterView,
  parseRosterWeek,
} from "@/features/roster/calendar";
import { buildCleanerRoster, buildSiteRoster } from "@/features/roster/model";
import type {
  RosterAssignment,
  RosterCleaner,
  RosterJob,
  RosterOffer,
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

type SiteQueryRow = {
  id: string;
  name: string;
  clients: { name: string };
};

type MemberQueryRow = {
  profile_id: string;
  profiles: { id: string; full_name: string };
};

type AssignmentQueryRow = {
  job_id: string;
  cleaner_id: string;
  slot_number: number;
  jobs: { site_id: string };
};

type OfferQueryRow = {
  id: string;
  job_id: string | null;
  cleaner_id: string;
  jobs: { scheduled_start: string };
};

type SeriesCleanerQueryRow = {
  recurring_assignment_id: string;
  cleaner_id: string;
  slot_number: number;
  recurring_assignments: {
    sites: { clients: { company_id: string } };
  };
};

type CountedResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
};

function requireCompleteRows<T>(label: string, result: CountedResult<T>) {
  if (result.error) throw result.error;
  if (!result.data || result.count === null) {
    throw new Error(`The ${label} query did not return an exact row count.`);
  }
  if (result.count !== result.data.length) {
    throw new Error(`The ${label} result exceeded the roster query page size.`);
  }
  return result.data;
}

export async function generateMetadata({ searchParams }: RosterPageProps) {
  const { view, week } = await searchParams;
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("Roster"),
  ]);
  return {
    title: formatRosterTitle(parseRosterWeek(week), parseRosterView(view), locale, {
      byCleaner: t("byCleaner").toLocaleLowerCase(locale),
      bySite: t("bySite").toLocaleLowerCase(locale),
      title: t("title"),
      weekOf: (range) => t("weekOf", { range }),
    }),
  };
}

export default async function RosterPage({ searchParams }: RosterPageProps) {
  const [{ view: requestedView, week }, { company, supabase }] = await Promise.all([
    searchParams,
    requireCompanyAdmin(),
  ]);
  const view = parseRosterView(requestedView);
  const locale = await getLocale();
  const t = await getTranslations("Roster");
  const weekStart = parseRosterWeek(week);
  const days = buildRosterDays(weekStart, locale);
  const { startsAt, endsAt } = getRosterWeekBounds(weekStart);

  const [
    sitesResult,
    membersResult,
    vacanciesResult,
    offersResult,
    seriesCleanersResult,
  ] = await Promise.all([
    supabase
      .from("sites")
      .select("id, name, clients!inner(name)", { count: "exact" })
      .eq("clients.company_id", company.id)
      .order("name")
      .order("id")
      .overrideTypes<SiteQueryRow[], { merge: false }>(),
    supabase
      .from("company_members")
      .select("profile_id, profiles!inner(id, full_name)", { count: "exact" })
      .eq("company_id", company.id)
      .eq("status", "active")
      .order("profile_id")
      .overrideTypes<MemberQueryRow[], { merge: false }>(),
    supabase
      .from("vacancies")
      .select(
        "job_id, site_id, site_name, scheduled_start, crew_slot, crew_size",
        { count: "exact" },
      )
      .eq("company_id", company.id)
      .gte("scheduled_start", startsAt)
      .lt("scheduled_start", endsAt)
      .order("scheduled_start")
      .order("job_id")
      .order("crew_slot"),
    supabase
      .from("offers")
      .select("id, job_id, cleaner_id, jobs!inner(scheduled_start)", { count: "exact" })
      .eq("company_id", company.id)
      .eq("status", "pending")
      .gte("jobs.scheduled_start", startsAt)
      .lt("jobs.scheduled_start", endsAt)
      .order("created_at")
      .order("id")
      .overrideTypes<OfferQueryRow[], { merge: false }>(),
    supabase
      .from("recurring_assignment_cleaners")
      .select(
        "recurring_assignment_id, cleaner_id, slot_number, recurring_assignments!inner(sites!inner(clients!inner(company_id)))",
        { count: "exact" },
      )
      .is("accepted_at", null)
      .eq("recurring_assignments.sites.clients.company_id", company.id)
      .order("recurring_assignment_id")
      .order("slot_number")
      .overrideTypes<SeriesCleanerQueryRow[], { merge: false }>(),
  ]);
  const siteRows = requireCompleteRows("company site", sitesResult);
  const memberRows = requireCompleteRows("active cleaner membership", membersResult);
  const vacancyRows = requireCompleteRows("weekly vacancy", vacanciesResult);
  const offerRows = requireCompleteRows("pending company offer", offersResult);
  const seriesCleanerRows = requireCompleteRows(
    "unaccepted recurring cleaner",
    seriesCleanersResult,
  );

  const siteIds = siteRows.map((site) => site.id);
  const [jobsResult, assignmentsResult] = await Promise.all([
    siteIds.length
      ? supabase
        .from("jobs")
        .select(
          "id, site_id, scheduled_start, crew_size, status, recurring_assignment_id",
          { count: "exact" },
        )
        .in("site_id", siteIds)
        .gte("scheduled_start", startsAt)
        .lt("scheduled_start", endsAt)
        .in("status", [...visibleJobStatuses])
        .order("scheduled_start")
        .order("id")
      : Promise.resolve({ data: [], error: null, count: 0 }),
    siteIds.length
      ? supabase
        .from("job_assignments")
        .select("job_id, cleaner_id, slot_number, jobs!inner(site_id)", { count: "exact" })
        .in("jobs.site_id", siteIds)
        .gte("assignment_start", startsAt)
        .lt("assignment_start", endsAt)
        .is("unassigned_at", null)
        .order("job_id")
        .order("slot_number")
        .overrideTypes<AssignmentQueryRow[], { merge: false }>()
      : Promise.resolve({ data: [], error: null, count: 0 }),
  ]);
  const jobRows = requireCompleteRows("weekly jobs", jobsResult);
  const assignmentRows = requireCompleteRows("weekly assignment", assignmentsResult);

  const siteNames = new Map(siteRows.map((site) => [site.id, site.name]));
  const jobs: RosterJob[] = jobRows.map((job) => {
    const siteName = siteNames.get(job.site_id);
    if (!siteName) throw new Error(`Roster job ${job.id} has no visible site.`);
    return {
      id: job.id,
      siteId: job.site_id,
      siteName,
      scheduledStart: job.scheduled_start,
      crewSize: job.crew_size,
      recurringAssignmentId: job.recurring_assignment_id ?? null,
    };
  });
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const jobsByRecurringAssignment = new Map<string, RosterJob[]>();
  for (const job of jobs) {
    if (!job.recurringAssignmentId) continue;
    const seriesJobs = jobsByRecurringAssignment.get(job.recurringAssignmentId) ?? [];
    seriesJobs.push(job);
    jobsByRecurringAssignment.set(job.recurringAssignmentId, seriesJobs);
  }
  const activeAssignmentKeys = new Set(
    assignmentRows.map((assignment) => `${assignment.job_id}:${assignment.cleaner_id}`),
  );
  const offers: RosterOffer[] = [];
  for (const offer of offerRows) {
    if (!offer.job_id || !jobsById.has(offer.job_id)) continue;
    offers.push({
      key: `offer:${offer.id}`,
      jobId: offer.job_id,
      cleanerId: offer.cleaner_id,
    });
  }
  for (const namedCleaner of seriesCleanerRows) {
    for (
      const job of jobsByRecurringAssignment.get(namedCleaner.recurring_assignment_id) ?? []
    ) {
      if (activeAssignmentKeys.has(`${job.id}:${namedCleaner.cleaner_id}`)) continue;
      offers.push({
        key: `series:${namedCleaner.recurring_assignment_id}:${namedCleaner.slot_number}:${job.id}`,
        jobId: job.id,
        cleanerId: namedCleaner.cleaner_id,
      });
    }
  }
  const assignments: RosterAssignment[] = assignmentRows.map((assignment) => ({
    jobId: assignment.job_id,
    cleanerId: assignment.cleaner_id,
    slotNumber: assignment.slot_number,
  }));
  const cleaners: RosterCleaner[] = memberRows
    .map((membership) => ({
      id: membership.profiles.id,
      name: membership.profiles.full_name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const sites: RosterSite[] = siteRows.map((site) => ({
    id: site.id,
    name: site.name,
    clientName: site.clients.name,
  }));
  const vacancies: RosterVacancy[] = vacancyRows.map((vacancy) => {
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

  const rosterInput = {
    days,
    cleaners,
    jobs,
    assignments,
    offers,
    vacancies,
    labels: {
      unavailableCleaner: t("unavailableCleaner"),
      unfilledSlots: t("unfilledSlots"),
    },
  };
  const model = view === "site"
    ? buildSiteRoster({ ...rosterInput, sites })
    : buildCleanerRoster(rosterInput);
  return (
    <RosterWeek
      days={days}
      hasFoundation={sites.length > 0 || cleaners.length > 0 || jobs.length > 0}
      model={model}
      todayKey={getBrisbaneDateKey()}
      view={view}
      weekStart={weekStart}
    />
  );
}
