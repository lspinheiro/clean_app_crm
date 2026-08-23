import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CompanyCreationForm } from "./company-creation-form";

import { requireCompanyAdmin } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("newCompany") };
}

export default async function NewCompanyPage() {
  const { company } = await requireCompanyAdmin();

  return (
    <main className="page-shell company-creation-page">
      <CompanyCreationForm activeCompanyName={company.name} />
    </main>
  );
}
