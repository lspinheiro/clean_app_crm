import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/language-switcher";
import {
  employeeListRowsSchema,
  type EmployeeListItem,
} from "@/features/employee-management/schema";
import { employeeInvitationListRowsSchema } from "@/features/employee-invitations/schema";
import { settingsPermissionsForRole } from "@/features/settings/permissions";
import { isAppLocale, type AppLocale } from "@/i18n/config";
import { CompanyIdentityForm } from "./company-identity-form";
import { CompanyIdentitySummary } from "./company-identity-summary";
import { EmployeeManagement } from "./employee-management";
import {
  EmployeeInvitations,
  type EmployeeInvitationListItem,
} from "./employee-invitations";

import { requireCompanyAdmin } from "@/lib/auth/session";
import { getCompanyLogoUrl } from "@/lib/company-logo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("settings") };
}

export default async function SettingsPage() {
  const { company, membership, profile, supabase } = await requireCompanyAdmin();
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("Settings");
  const permissions = settingsPermissionsForRole(membership.role);
  const logoUrl = await getCompanyLogoUrl(supabase, company.logo_path);
  let employees: EmployeeListItem[] = [];
  if (permissions.canManageEmployees) {
    const { data: employeeRows, error: employeeError } = await supabase
      .from("employee_membership_details")
      .select("membership_id, company_id, profile_id, full_name, email, role, joined_at")
      .eq("company_id", company.id)
      .order("joined_at", { ascending: true });
    if (employeeError) throw employeeError;
    employees = employeeListRowsSchema.parse(employeeRows).map((employee) => ({
      email: employee.email,
      fullName: employee.full_name,
      joinedAt: employee.joined_at,
      membershipId: employee.membership_id,
      profileId: employee.profile_id,
      role: employee.role,
    }));
  }

  let invitations: EmployeeInvitationListItem[] = [];
  if (permissions.canManageInvitations) {
    const { data: invitationRows, error: invitationError } = await supabase
      .from("employee_invitation_states")
      .select("id, email, role, created_at, invitation_state")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    if (invitationError) throw invitationError;
    invitations = employeeInvitationListRowsSchema.parse(invitationRows).map((invitation) => ({
      createdAt: invitation.created_at,
      email: invitation.email,
      id: invitation.id,
      role: invitation.role,
      state: invitation.invitation_state,
    }));
  }

  return (
    <main className="page-shell settings-shell">
      <header className="page-header-row">
        <div>
          <h1 className="page-heading">{t("title")}</h1>
        </div>
      </header>
      {permissions.canEditPersonalLocale ? (
        <section className="settings-card" aria-labelledby="account-heading">
          <h2 id="account-heading">{t("accountHeading")}</h2>
          <p className="settings-card__description">{t("accountDescription")}</p>
          <LanguageSwitcher
            authenticated
            currentLocale={locale}
            savedLocale={isAppLocale(profile.preferred_locale) ? profile.preferred_locale : null}
          />
        </section>
      ) : null}
      {permissions.canViewCompanyIdentity ? (
        permissions.canEditCompanyIdentity ? (
          <CompanyIdentityForm company={company} logoUrl={logoUrl} />
        ) : (
          <CompanyIdentitySummary company={company} logoUrl={logoUrl} />
        )
      ) : null}
      {permissions.canManageEmployees ? (
        <EmployeeManagement currentProfileId={profile.id} employees={employees} />
      ) : null}
      {permissions.canManageInvitations ? (
        <EmployeeInvitations invitations={invitations} />
      ) : null}
    </main>
  );
}
