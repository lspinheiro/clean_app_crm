import { useLocale, useTranslations } from "next-intl";

import {
  formatMoneyAmount,
  formatMoneyJobDate,
  formatMoneyJobTime,
  formatMoneyStatus,
} from "@/features/money/format";
import type { CompanyMoneyLedger } from "@/features/money/types";
import type { AppLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";

type MoneyListProps = {
  ledger: CompanyMoneyLedger;
};

export function MoneyList({ ledger }: MoneyListProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Money");
  return (
    <>
      <section aria-label={t("totals")} className="money-totals">
        <h2 className="visually-hidden">{t("totals")}</h2>
        <dl>
          <div>
            <dt>{t("totalOwed")}</dt>
            <dd>
              <strong className="tabular-numerals">
                {formatMoneyAmount(ledger.owedCents, locale)}
              </strong>
              <span>{t("awaitingSettlement")}</span>
            </dd>
          </div>
          <div>
            <dt>{t("totalPaid")}</dt>
            <dd>
              <strong className="tabular-numerals">
                {formatMoneyAmount(ledger.paidCents, locale)}
              </strong>
              <span>{t("recordedSettled")}</span>
            </dd>
          </div>
        </dl>
      </section>

      {ledger.entries.length ? (
        <section aria-labelledby="money-history-heading" className="money-history">
          <div className="money-history-header">
            <h2 id="money-history-heading">{t("history")}</h2>
            <p className="money-entry-count tabular-numerals">
              {t("entryCount", { count: ledger.entries.length })}
            </p>
          </div>
          <div
            aria-label={t("table")}
            className="money-table-region"
            role="region"
            tabIndex={0}
          >
            <table className="money-table">
              <caption>{t("caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("cleaner")}</th>
                  <th scope="col">{t("job")}</th>
                  <th scope="col">{t("site")}</th>
                  <th scope="col">{t("amount")}</th>
                  <th scope="col">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="money-cleaner-name">{entry.cleanerName}</td>
                    <td>
                      <Link
                        aria-label={t("jobLabel", {
                          siteName: entry.siteName,
                          date: formatMoneyJobDate(entry.scheduledStart, locale),
                        })}
                        className="money-job-link"
                        href={`/jobs/${entry.jobId}`}
                      >
                        <time dateTime={entry.scheduledStart}>
                          <strong>{formatMoneyJobDate(entry.scheduledStart, locale)}</strong>
                          <span className="tabular-numerals">
                            {formatMoneyJobTime(entry.scheduledStart, locale)}
                          </span>
                        </time>
                      </Link>
                    </td>
                    <td>{entry.siteName}</td>
                    <td>
                      <strong className="money-amount tabular-numerals">
                        {formatMoneyAmount(entry.amountCents, locale)}
                      </strong>
                    </td>
                    <td>
                      <span className={`money-status money-status--${entry.status}`}>
                        {formatMoneyStatus(entry.status, t)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="money-empty">
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyDescription")}</p>
        </section>
      )}
    </>
  );
}
