import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/language-switcher";
import { isAppLocale, type AppLocale } from "@/i18n/config";
import { CompanyIdentityForm } from "./company-identity-form";

import { requireCompanyAdmin } from "@/lib/auth/session";
import { getCompanyLogoUrl } from "@/lib/company-logo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("settings") };
}

export default async function SettingsPage() {
  const { company, profile, supabase } = await requireCompanyAdmin();
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("Settings");
  const logoUrl = await getCompanyLogoUrl(supabase, company.logo_path);

  return (
    <main className="page-shell settings-shell">
      <header className="page-header-row">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="page-heading">{t("title")}</h1>
        </div>
      </header>
      <CompanyIdentityForm company={company} logoUrl={logoUrl} />
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
