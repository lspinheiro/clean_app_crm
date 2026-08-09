import { CrmHeader } from "@/components/crm-header";
import { requireCompanyAdmin } from "@/lib/auth/session";

export default async function CrmLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { company } = await requireCompanyAdmin();
  return (
    <>
      <CrmHeader companyName={company.name} />
      {children}
    </>
  );
}
