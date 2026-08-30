import { getTranslations } from "next-intl/server";

import { CrmHeader } from "@/components/crm-header";
import type { CrmNotification } from "@/components/notification-bell";
import { requireCompanyAdmin } from "@/lib/auth/session";
import { getCompanyLogoUrl } from "@/lib/company-logo";

const crmNotificationTypes = ["application_received", "offer_declined"] as const;

export default async function CrmLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("Navigation");
  const { company, memberships, profile, supabase, user } = await requireCompanyAdmin();
  const [logoUrl, notificationResult] = await Promise.all([
    getCompanyLogoUrl(supabase, company.logo_path),
    supabase
      .from("notifications")
      .select(
        "id, job_id, type, read_at, created_at, jobs!inner(sites!inner(name, clients!inner(company_id)))",
      )
      .eq("recipient_id", profile.id)
      .in("type", crmNotificationTypes)
      .eq("jobs.sites.clients.company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (notificationResult.error) throw notificationResult.error;
  const notifications = notificationResult.data.map((notification): CrmNotification => {
    const notificationBase = {
      id: notification.id,
      jobId: notification.job_id,
      siteName: notification.jobs.sites.name,
      createdAt: notification.created_at,
      readAt: notification.read_at,
    };
    switch (notification.type) {
      case "application_received":
      case "offer_declined":
        return { ...notificationBase, type: notification.type };
      default:
        throw new Error("The CRM notification query returned an unsupported type.");
    }
  });
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
