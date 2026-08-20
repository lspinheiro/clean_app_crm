import { Settings } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { AccountMenu, type CrmMembershipOption } from "./account-menu";
import { BrandBubbles } from "./brand-bubbles";
import { CrmNavigation, CrmSettingsLink } from "./crm-navigation";

type CrmHeaderProps = {
  companyId: string;
  companyName: string;
  employeeRole: "owner" | "staff";
  logoUrl: string | null;
  memberships: CrmMembershipOption[];
  profileName: string;
};

export function CrmHeader({
  companyId,
  companyName,
  employeeRole,
  logoUrl,
  memberships,
  profileName,
}: CrmHeaderProps) {
  const t = useTranslations("Navigation");
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link
          className="brand-lockup"
          href="/roster"
          aria-label={t("brandLabel", { companyName })}
        >
          {logoUrl ? (
            <span className="brand-logo">
              <Image
                alt={t("companyLogo", { companyName })}
                fill
                sizes="36px"
                src={logoUrl}
                unoptimized
              />
            </span>
          ) : (
            <BrandBubbles />
          )}
          <span>The Clean Crew</span>
        </Link>
        <CrmNavigation />
        <div className="header-actions">
          {employeeRole === "owner" ? (
            <CrmSettingsLink>
              <Settings aria-hidden="true" size={21} strokeWidth={2.25} />
            </CrmSettingsLink>
          ) : null}
          <AccountMenu
            activeCompanyId={companyId}
            key={companyId}
            memberships={memberships}
            profileName={profileName}
          />
        </div>
      </div>
    </header>
  );
}
