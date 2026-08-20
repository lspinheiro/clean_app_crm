import { Building2, ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { signOutAction } from "@/app/actions/auth";
import { BrandBubbles } from "@/components/brand-bubbles";
import { defaultLocale, isAppLocale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { getCompanyAdminContext } from "@/lib/auth/session";

function cleanerAppUrl() {
  try {
    return new URL(
      process.env.NEXT_PUBLIC_CLEANER_APP_URL ?? "http://127.0.0.1:3001",
    ).toString();
  } catch {
    return "http://127.0.0.1:3001/";
  }
}

export default async function NoCompanyAccessPage() {
  const context = await getCompanyAdminContext();
  const requestLocale = await getLocale();
  const locale = isAppLocale(requestLocale) ? requestLocale : defaultLocale;
  if (context.decision.kind === "allowed") {
    return redirect({ href: "/roster", locale });
  }
  if (context.decision.reason === "anonymous") {
    return redirect({ href: "/login", locale });
  }

  const t = await getTranslations("NoCompanyAccess");
  return (
    <main className="no-company-page">
      <section className="no-company-card" aria-labelledby="no-company-title">
        <BrandBubbles />
        <div className="no-company-card__icon" aria-hidden="true">
          <Building2 size={26} />
        </div>
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 id="no-company-title">{t("title")}</h1>
        <p>{t("description")}</p>
        <div className="no-company-card__actions">
          <a className="button" href={cleanerAppUrl()}>
            {t("cleanerApp")}
            <ExternalLink aria-hidden="true" size={17} />
          </a>
          <form action={signOutAction}>
            <button className="button button--secondary" type="submit">
              {t("signOut")}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
