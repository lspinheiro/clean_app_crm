import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CleanersWorkspace } from "./cleaners-workspace";

import { normaliseCleanerAppUrl } from "@/features/cleaners/invite";
import type { CleanerMember } from "@/features/cleaners/types";
import { parsePostingRows } from "@/features/postings/model";
import { requireCompanyAdmin } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("cleaners") };
}

export default async function CleanersPage() {
  const t = await getTranslations("Cleaners");
  const cleanerAppUrl = process.env.NEXT_PUBLIC_CLEANER_APP_URL;
  if (!cleanerAppUrl) {
    throw new Error(
      "Cleaner app URL is not configured. Set NEXT_PUBLIC_CLEANER_APP_URL for the CRM.",
    );
  }
  const cleanerAppOrigin = normaliseCleanerAppUrl(cleanerAppUrl);

  const { company, supabase } = await requireCompanyAdmin();
  const [
    { data: postingRows, error: postingError },
    { data: membershipRows, error: membershipError },
  ] = await Promise.all([
    supabase
      .from("posting_states")
      .select("id, code, intent, public_description, created_at, state, closing_reason, application_count")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("company_members")
      .select("profile_id, joined_at")
      .eq("company_id", company.id)
      .eq("status", "active")
      .order("joined_at"),
  ]);
  if (postingError) throw postingError;
  if (membershipError) throw membershipError;
  const postings = parsePostingRows(postingRows);

  const memberIds = membershipRows.map((membership) => membership.profile_id);
  const { data: profileRows, error: profileError } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", memberIds)
    : { data: [], error: null };
  if (profileError) throw profileError;

  const cleanersById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const members: CleanerMember[] = membershipRows.flatMap((membership) => {
    const profile = cleanersById.get(membership.profile_id);
    return profile
      ? [{ id: profile.id, joinedAt: membership.joined_at, name: profile.full_name }]
      : [];
  });

  return (
    <main className="page-shell cleaners-page-shell">
      <header className="page-header-row cleaners-page-header">
        <div>
          <h1 className="page-heading">{t("title")}</h1>
          <p className="page-description">{t("description")}</p>
        </div>
      </header>
      <CleanersWorkspace
        cleanerAppUrl={cleanerAppOrigin}
        companyName={company.name}
        key={company.id}
        members={members}
        postings={postings}
      />
    </main>
  );
}
