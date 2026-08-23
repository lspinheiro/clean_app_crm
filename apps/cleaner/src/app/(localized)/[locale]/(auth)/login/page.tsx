import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandBubbles } from "@/components/brand-bubbles";
import { defaultLocale, isAppLocale } from "@/i18n/config";
import { loadCleanerMessages } from "@/i18n/messages";

import { LoginScreen } from "./login-screen";

type LoginPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const { locale: candidate } = await params;
  const locale = isAppLocale(candidate) ? candidate : defaultLocale;
  return { title: (await loadCleanerMessages(locale)).Metadata.loginTitle };
}

export default async function LoginPage({ params }: LoginPageProps) {
  const { locale: candidate } = await params;
  const locale = isAppLocale(candidate) ? candidate : defaultLocale;
  const messages = await loadCleanerMessages(locale);

  return (
    <main className="screen">
      <span className="brand-lockup">
        <BrandBubbles />
        {messages.Common.brand}
      </span>
      <Suspense fallback={<p className="screen-lead">{messages.Common.loading}</p>}>
        <LoginScreen />
      </Suspense>
    </main>
  );
}
