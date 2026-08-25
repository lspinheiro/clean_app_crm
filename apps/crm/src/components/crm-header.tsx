import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { AccountMenu } from "./account-menu";
import { BrandBubbles } from "./brand-bubbles";
import { CompanySwitcher, type CrmMembershipOption } from "./company-switcher";
import { CrmNavigation } from "./crm-navigation";
import {
  NotificationBell,
  type ApplicationNotification,
} from "./notification-bell";

type CrmHeaderProps = {
  companyId: string;
  companyName: string;
  logoUrl: string | null;
  memberships: CrmMembershipOption[];
  notifications?: ApplicationNotification[];
  profileEmail?: string;
  profileId?: string;
  profileName: string;
};

export function CrmHeader({
  companyId,
  companyName,
  logoUrl,
  memberships,
  notifications = [],
  profileEmail,
  profileId,
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
          {profileId ? (
            <NotificationBell notifications={notifications} profileId={profileId} />
          ) : null}
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
