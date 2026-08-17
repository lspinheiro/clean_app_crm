import { Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { BrandBubbles } from "./brand-bubbles";
import { CrmNavigation, CrmSettingsLink } from "./crm-navigation";

type CrmHeaderProps = {
  companyName: string;
  logoUrl: string | null;
};

export function CrmHeader({ companyName, logoUrl }: CrmHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand-lockup" href="/roster" aria-label={`${companyName} — The Clean Crew`}>
          {logoUrl ? (
            <span className="brand-logo">
              <Image alt={`${companyName} logo`} fill sizes="36px" src={logoUrl} unoptimized />
            </span>
          ) : (
            <BrandBubbles />
          )}
          <span>The Clean Crew</span>
        </Link>
        <CrmNavigation />
        <div className="header-actions">
          <CrmSettingsLink>
            <Settings aria-hidden="true" size={21} strokeWidth={2.25} />
          </CrmSettingsLink>
        </div>
      </div>
    </header>
  );
}
