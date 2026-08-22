import Image from "next/image";
import { useTranslations } from "next-intl";

import { BrandBubbles } from "@/components/brand-bubbles";

type CompanyIdentitySummaryProps = {
  company: {
    abn: string;
    name: string;
    timezone: string;
  };
  logoUrl: string | null;
};

export function CompanyIdentitySummary({
  company,
  logoUrl,
}: CompanyIdentitySummaryProps) {
  const t = useTranslations("Settings");

  return (
    <section className="settings-card" aria-labelledby="business-identity-heading">
      <h2 id="business-identity-heading">{t("identity")}</h2>
      <p className="settings-card__description">{t("identityReadOnlyDescription")}</p>
      <div className="identity-summary">
        <dl className="identity-summary__details">
          <div>
            <dt>{t("companyName")}</dt>
            <dd>{company.name}</dd>
          </div>
          <div>
            <dt>ABN</dt>
            <dd>{company.abn}</dd>
          </div>
          <div>
            <dt>{t("timezoneLabel")}</dt>
            <dd>{company.timezone}</dd>
          </div>
        </dl>
        <div className="logo-preview identity-summary__logo">
          {logoUrl ? (
            <Image
              alt={t("logoAlt", { companyName: company.name })}
              fill
              sizes="96px"
              src={logoUrl}
              unoptimized
            />
          ) : (
            <BrandBubbles size={56} />
          )}
        </div>
      </div>
    </section>
  );
}
