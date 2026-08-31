import { Suspense } from "react";

import { BrandBubbles } from "@/components/brand-bubbles";
import { defaultLocale, isAppLocale } from "@/i18n/config";
import { loadCleanerMessages } from "@/i18n/messages";

import { CallbackScreen } from "./callback-screen";

type CallbackPageProps = { params: Promise<{ locale: string }> };

export default async function CallbackPage({ params }: CallbackPageProps) {
  const { locale: candidate } = await params;
  const locale = isAppLocale(candidate) ? candidate : defaultLocale;
  const messages = await loadCleanerMessages(locale);

  return (
    <main className="screen screen--centred">
      <span className="brand-lockup">
        <BrandBubbles />
        {messages.Common.brand}
      </span>
      <Suspense fallback={<p className="screen-lead">{messages.Common.loading}</p>}>
        <CallbackScreen />
      </Suspense>
    </main>
  );
}
