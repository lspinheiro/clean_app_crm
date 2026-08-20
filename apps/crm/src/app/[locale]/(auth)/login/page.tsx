import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { BrandBubbles } from "@/components/brand-bubbles";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { AppLocale } from "@/i18n/config";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("login") };
}

type LoginPageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("Auth");

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="brand-lockup">
          <BrandBubbles />
          The Clean Crew
        </div>
        <div>
          <h1>{t("headline")}</h1>
          <p>{t("intro")}</p>
        </div>
        <p>{t("location")}</p>
      </section>
      <section className="auth-panel" aria-labelledby="sign-in-title">
        <div className="auth-panel__inner">
          <LanguageSwitcher currentLocale={locale} />
          <h2 id="sign-in-title">{t("title")}</h2>
          <p className="auth-panel__intro">{t("accountHint")}</p>
          <LoginForm returnTo={Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo} />
          <p className="auth-note">{t("alphaNote")}</p>
        </div>
      </section>
    </main>
  );
}
