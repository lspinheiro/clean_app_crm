import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { AccountMenu } from "./account-menu";
import { BrandBubbles } from "./brand-bubbles";
import { CompanySwitcher, type CrmMembershipOption } from "./company-switcher";
import { CrmNavigation } from "./crm-navigation";

type CrmHeaderProps = {
  companyId: string;
  companyName: string;
  logoUrl: string | null;
  memberships: CrmMembershipOption[];
  profileEmail?: string;
  profileName: string;
};

export function CrmHeader({
  companyId,
  companyName,
  logoUrl,
  memberships,
  profileEmail,
  profileName,
}: CrmHeaderProps) {
  const t = useTranslations("Navigation");
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link
          className="brand-lockup"
          href="/roster"
          aria-label={t("brandLabel")}
        >
          <BrandBubbles />
          <span>The Clean Crew</span>
        </Link>
        <CompanySwitcher
          activeCompanyId={companyId}
          activeCompanyName={companyName}
          activeLogoUrl={logoUrl}
          memberships={memberships}
        />
        <CrmNavigation />
        <div className="header-actions">
          <AccountMenu
            key={companyId}
            profileEmail={profileEmail}
            profileName={profileName}
          />
        </div>
      </div>
    </header>
  );
}
