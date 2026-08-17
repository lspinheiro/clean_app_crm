import { PoolWorkspace } from "./pool-workspace";

import { isInviteActive, normaliseCleanerAppUrl } from "@/features/pool/invite";
import type { PoolMember } from "@/features/pool/types";
import { requireCompanyAdmin } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("pool") };
}

export default async function PoolPage() {
  const t = await getTranslations("Pool");
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
      .select("code, expires_at")
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
        .select("id, full_name, role")
        .in("id", memberIds)
        .eq("role", "cleaner")
    : { data: [], error: null };
  if (profileError) throw profileError;

  const cleanersById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const members: PoolMember[] = membershipRows.flatMap((membership) => {
    const profile = cleanersById.get(membership.profile_id);
    return profile
      ? [{ id: profile.id, joinedAt: membership.joined_at, name: profile.full_name }]
      : [];
  });

  return (
    <main className="page-shell pool-page-shell">
      <header className="page-header-row pool-page-header">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="page-heading">{t("title")}</h1>
          <p className="page-description">{t("description")}</p>
        </div>
      </header>
      <PoolWorkspace
        cleanerAppUrl={cleanerAppOrigin}
        companyName={company.name}
        initialCode={displayedInvite?.code ?? null}
        key={displayedInvite?.code ?? "no-active-invite"}
        members={members}
      />
    </main>
  );
}
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
