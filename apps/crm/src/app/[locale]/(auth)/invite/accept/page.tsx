import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { BrandBubbles } from "@/components/brand-bubbles";
import { FirstAdminAcceptanceForm } from "./accept-form";
import { defaultLocale, isAppLocale } from "@/i18n/config";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

type FirstAdminAcceptancePageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("firstAdminInvitation") };
}

function AuthShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="brand-lockup">
          <BrandBubbles />
          The Clean Crew
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel__inner">{children}</div>
      </section>
    </main>
  );
}

export default async function FirstAdminAcceptancePage({
  searchParams,
}: FirstAdminAcceptancePageProps) {
  await searchParams;
  const requestLocale = await getLocale();
  const locale = isAppLocale(requestLocale) ? requestLocale : defaultLocale;
  const t = await getTranslations("FirstAdminInvitation");
  let context:
    | {
        invitation_status: string;
        invitee_email: string;
        locale: "en-AU" | "pt-BR";
      }
    | null = null;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!userError && user?.email) {
    const { data, error } = await supabase.rpc("get_first_admin_invitation_context");
    if (!error && data?.[0]) context = data[0];
  }

  if (context?.invitation_status === "accepted") {
    return redirect({ href: "/onboarding", locale });
  }

  if (!context || context.invitation_status !== "pending") {
    return (
      <AuthShell>
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("unavailableTitle")}</h1>
        <p className="auth-panel__intro">{t("unavailableDescription")}</p>
        <Link className="button button--secondary" href="/login">
          {t("backToLogin")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <p className="auth-panel__intro">{t("intro")}</p>
      <FirstAdminAcceptanceForm
        defaultLocale={context.locale}
        inviteeEmail={context.invitee_email}
      />
    </AuthShell>
  );
}
