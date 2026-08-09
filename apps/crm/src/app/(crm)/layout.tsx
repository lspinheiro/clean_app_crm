import { CrmHeader } from "@/components/crm-header";
import { requireCompanyAdmin } from "@/lib/auth/session";
import { getCompanyLogoUrl } from "@/lib/company-logo";

export default async function CrmLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { company, supabase } = await requireCompanyAdmin();
  const logoUrl = await getCompanyLogoUrl(supabase, company.logo_path);
  return (
    <>
      <CrmHeader companyName={company.name} logoUrl={logoUrl} />
      {children}
    </>
  );
}
