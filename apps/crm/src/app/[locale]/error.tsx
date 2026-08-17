"use client";

import { useTranslations } from "next-intl";

import { BubbleCluster } from "@/components/bubble-cluster";

export default function ErrorPage({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("ErrorPages");

  return (
    <main className="page-shell">
      <section className="empty-workspace">
        <BubbleCluster />
        <h1 className="page-heading">{t("unexpectedTitle")}</h1>
        <p>{t("unexpectedDescription")}</p>
        <button className="button" onClick={reset} type="button">
          {t("retry")}
        </button>
      </section>
    </main>
  );
}
