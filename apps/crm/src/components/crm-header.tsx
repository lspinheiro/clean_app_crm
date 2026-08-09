import { Settings } from "lucide-react";
import Link from "next/link";

import { CrmNavigation } from "./crm-navigation";

type CrmHeaderProps = {
  companyName: string;
};

export function CrmHeader({ companyName }: CrmHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand-lockup" href="/roster" aria-label={`${companyName} — Clean App`}>
          <span className="brand-mark" aria-hidden="true">CA</span>
          <span>Clean App</span>
        </Link>
        <CrmNavigation />
        <div className="header-actions">
          <span className="button" aria-disabled="true">+ New job</span>
          <Link className="icon-button" href="/settings" aria-label="Company settings">
            <Settings aria-hidden="true" size={21} strokeWidth={2.25} />
          </Link>
        </div>
      </div>
    </header>
  );
}
