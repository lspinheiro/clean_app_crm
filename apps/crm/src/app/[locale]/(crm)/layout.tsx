import { getTranslations } from "next-intl/server";

import { CrmHeader } from "@/components/crm-header";
import { requireCompanyAdmin } from "@/lib/auth/session";
import { getCompanyLogoUrl } from "@/lib/company-logo";

export default async function CrmLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("Navigation");
  const { company, memberships, profile, supabase, user } = await requireCompanyAdmin();
  const [logoUrl, notificationResult] = await Promise.all([
    getCompanyLogoUrl(supabase, company.logo_path),
    supabase
      .from("notifications")
      .select(
        "id, job_id, read_at, created_at, jobs!inner(sites!inner(name, clients!inner(company_id)))",
      )
      .eq("recipient_id", profile.id)
      .eq("type", "application_received")
      .eq("jobs.sites.clients.company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (notificationResult.error) throw notificationResult.error;
  const notifications = notificationResult.data.map((notification) => ({
    id: notification.id,
    jobId: notification.job_id,
    siteName: notification.jobs.sites.name,
    createdAt: notification.created_at,
    readAt: notification.read_at,
  }));
  return (
    <>
      <a className="skip-link" href="#main-content">{t("skip")}</a>
      <CrmHeader
        companyId={company.id}
        companyName={company.name}
        logoUrl={logoUrl}
        memberships={memberships}
        notifications={notifications}
        profileEmail={user.email ?? undefined}
        profileId={profile.id}
        profileName={profile.full_name}
      />
      <div id="main-content" tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
