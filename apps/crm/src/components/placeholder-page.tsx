import { useTranslations } from "next-intl";

import { BubbleCluster } from "./bubble-cluster";

type PlaceholderPageProps = {
  description: string;
  title: string;
};

export function PlaceholderPage({ description, title }: PlaceholderPageProps) {
  const t = useTranslations("Common");
  return (
    <main className="page-shell">
      <h1 className="page-heading">{title}</h1>
      <section className="empty-workspace">
        <BubbleCluster />
        <h2>{t("workspaceReady")}</h2>
        <p>{description}</p>
      </section>
    </main>
  );
}
