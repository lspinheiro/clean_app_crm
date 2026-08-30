import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { PostingComposer } from "./posting-composer";

import {
  parseOneTimePostingOptions,
  parseRegularPostingOptions,
} from "@/features/postings/model";
import type { PostingIntent } from "@/features/postings/types";
import { Link } from "@/i18n/navigation";
import { getServiceLabel } from "@/i18n/service-label";
import { requireCompanyAdmin } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("postingComposer") };
}

type PostingComposerPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const querySchema = z.object({
  intent: z.enum(["one_time", "regular"]).optional(),
  jobId: z.uuid().optional(),
  recurringAssignmentId: z.uuid().optional(),
});

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PostingComposerPage({ searchParams }: PostingComposerPageProps) {
  const t = await getTranslations("Postings");
  const serviceT = await getTranslations("Services");
  const rawQuery = await searchParams;
  const parsedQuery = querySchema.safeParse({
    intent: firstQueryValue(rawQuery.intent),
    jobId: firstQueryValue(rawQuery.jobId),
    recurringAssignmentId: firstQueryValue(rawQuery.recurringAssignmentId),
  });
  const { company, supabase } = await requireCompanyAdmin();

  const [vacanciesResult, recurringResult] = await Promise.all([
    supabase
      .from("vacancies")
      .select(
        "job_id, scheduled_start, duration_minutes, cleaner_pay_cents, sites!inner(name, suburb), service_catalogue!inner(name, slug)",
      )
      .eq("company_id", company.id)
      .gt("scheduled_start", new Date().toISOString())
      .order("scheduled_start"),
    supabase
      .from("recurring_assignments")
      .select(
        "id, active, frequency, weekday, local_start_time, duration_minutes, cleaner_pay_cents, crew_size, sites!inner(name, suburb, clients!inner(company_id)), service_catalogue!inner(name, slug), recurring_assignment_cleaners(cleaner_id)",
      )
      .eq("sites.clients.company_id", company.id)
      .eq("active", true)
      .order("weekday")
      .order("local_start_time"),
  ]);
  if (vacanciesResult.error) throw vacanciesResult.error;
  if (recurringResult.error) throw recurringResult.error;

  const serviceLabel = (service: { name: string; slug: string }) => (
    getServiceLabel(service, serviceT)
  );
  const jobs = parseOneTimePostingOptions(vacanciesResult.data, serviceLabel);
  const recurringAssignments = parseRegularPostingOptions(recurringResult.data, serviceLabel);

  let initialIntent: PostingIntent | null = null;
  let initialTargetId: string | null = null;
  if (parsedQuery.success && parsedQuery.data.intent === "one_time") {
    const selected = jobs.find((job) => job.id === parsedQuery.data.jobId);
    if (selected) {
      initialIntent = "one_time";
      initialTargetId = selected.id;
    }
  } else if (parsedQuery.success && parsedQuery.data.intent === "regular") {
    const selected = recurringAssignments.find(
      (assignment) => assignment.id === parsedQuery.data.recurringAssignmentId,
    );
    if (selected) {
      initialIntent = "regular";
      initialTargetId = selected.id;
    }
  }

  return (
    <main className="page-shell posting-composer-page-shell">
      <Link className="back-link" href="/cleaners">
        <ArrowLeft aria-hidden="true" size={18} />
        {t("back")}
      </Link>
      <header className="posting-composer-page-header">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="page-heading">{t("composerTitle")}</h1>
        <p className="page-description">{t("composerDescription")}</p>
      </header>
      <PostingComposer
        initialIntent={initialIntent}
        initialTargetId={initialTargetId}
        jobs={jobs}
        recurringAssignments={recurringAssignments}
      />
    </main>
  );
}
