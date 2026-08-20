import { getTranslations } from "next-intl/server";

import { CrmHeader } from "@/components/crm-header";
import { requireCompanyAdmin } from "@/lib/auth/session";
import { getCompanyLogoUrl } from "@/lib/company-logo";

export default async function CrmLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("Navigation");
  const { company, membership, memberships, profile, supabase } = await requireCompanyAdmin();
  const logoUrl = await getCompanyLogoUrl(supabase, company.logo_path);
  return (
    <>
      <a className="skip-link" href="#main-content">{t("skip")}</a>
      <CrmHeader
        companyId={company.id}
        companyName={company.name}
        employeeRole={membership.role}
        logoUrl={logoUrl}
        memberships={memberships}
        profileName={profile.full_name}
      />
      <div id="main-content" tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
