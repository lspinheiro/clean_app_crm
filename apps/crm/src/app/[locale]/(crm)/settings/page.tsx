import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/language-switcher";
import { employeeInvitationListRowsSchema } from "@/features/employee-invitations/schema";
import { isAppLocale, type AppLocale } from "@/i18n/config";
import { CompanyIdentityForm } from "./company-identity-form";
import {
  EmployeeInvitations,
  type EmployeeInvitationListItem,
} from "./employee-invitations";

import { requireCompanyOwner } from "@/lib/auth/session";
import { getCompanyLogoUrl } from "@/lib/company-logo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("settings") };
}

export default async function SettingsPage() {
  const { company, profile, supabase } = await requireCompanyOwner();
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("Settings");
  const logoUrl = await getCompanyLogoUrl(supabase, company.logo_path);
  const { data: invitationRows, error: invitationError } = await supabase
    .from("employee_invitation_states")
    .select("id, email, role, created_at, invitation_state")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });
  if (invitationError) throw invitationError;
  const invitations: EmployeeInvitationListItem[] = employeeInvitationListRowsSchema
    .parse(invitationRows)
    .map((invitation) => ({
    createdAt: invitation.created_at,
    email: invitation.email,
    id: invitation.id,
    role: invitation.role,
    state: invitation.invitation_state,
    }));

  return (
    <main className="page-shell settings-shell">
      <header className="page-header-row">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="page-heading">{t("title")}</h1>
        </div>
      </header>
      <CompanyIdentityForm company={company} logoUrl={logoUrl} />
      <EmployeeInvitations invitations={invitations} />
      <section className="settings-card" aria-labelledby="language-heading">
        <h2 id="language-heading">{t("languageHeading")}</h2>
        <p>{t("languageDescription")}</p>
        <LanguageSwitcher
          authenticated
          currentLocale={locale}
          savedLocale={isAppLocale(profile.preferred_locale) ? profile.preferred_locale : null}
        />
      </section>
    </main>
  );
}
