import { getTranslations } from "next-intl/server";

import { BubbleCluster } from "@/components/bubble-cluster";
import { Link } from "@/i18n/navigation";

export default async function NotFoundPage() {
  const t = await getTranslations("ErrorPages");

  return (
    <main className="page-shell">
      <section className="empty-workspace">
        <BubbleCluster />
        <h1 className="page-heading">{t("notFoundTitle")}</h1>
        <p>{t("notFoundDescription")}</p>
        <Link className="button" href="/roster">
          {t("backToRoster")}
        </Link>
      </section>
    </main>
  );
}
