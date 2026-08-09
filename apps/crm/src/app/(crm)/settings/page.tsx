import { CompanyIdentityForm } from "./company-identity-form";

import { requireCompanyAdmin } from "@/lib/auth/session";
import { getCompanyLogoUrl } from "@/lib/company-logo";

export default async function SettingsPage() {
  const { company, supabase } = await requireCompanyAdmin();
  const logoUrl = await getCompanyLogoUrl(supabase, company.logo_path);

  return (
    <main className="page-shell settings-shell">
      <header className="page-header-row">
        <div>
          <p className="eyebrow">Company record</p>
          <h1 className="page-heading">Company settings</h1>
        </div>
      </header>
      <CompanyIdentityForm company={company} logoUrl={logoUrl} />
    </main>
  );
}
