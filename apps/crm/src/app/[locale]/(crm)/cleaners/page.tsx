import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CleanersWorkspace } from "./cleaners-workspace";

import { isInviteActive, normaliseCleanerAppUrl } from "@/features/cleaners/invite";
import type { CleanerMember } from "@/features/cleaners/types";
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
    { data: activeInvite, error: inviteError },
    { data: membershipRows, error: membershipError },
  ] = await Promise.all([
    supabase
      .from("company_invites")
      .select("id, code, expires_at")
      .eq("company_id", company.id)
      .is("revoked_at", null)
      .maybeSingle(),
    supabase
      .from("company_members")
      .select("profile_id, joined_at")
      .eq("company_id", company.id)
      .eq("status", "active")
      .order("joined_at"),
  ]);
  if (inviteError) throw inviteError;
  if (membershipError) throw membershipError;
  const displayedInvite = activeInvite && isInviteActive(activeInvite.expires_at)
    ? activeInvite
    : null;

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
        initialCode={displayedInvite?.code ?? null}
        initialInviteId={displayedInvite?.id ?? null}
        // Keyed on the company, not the invite: a rotation changes the code, and keying on
        // it tore the workspace down mid-rotation, shutting the details panel over the
        // replacement link the admin had just generated to hand out. Switching company is
        // the case that genuinely warrants a fresh workspace.
        key={company.id}
        members={members}
      />
    </main>
  );
}
