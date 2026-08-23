import { useLocale, useTranslations } from "next-intl";

import { toVacancyState } from "@/features/board/application";
import {
  describeOpenSlots,
  formatCleanerPay,
  formatJobDate,
  formatJobDuration,
  formatJobTime,
} from "@/features/board/format";
import type { Vacancy } from "@/features/board/types";
import type { AppLocale } from "@/i18n/config";
import { getServiceLabel } from "@/i18n/service-label";

type VacancyCardProps = {
  vacancy: Vacancy;
  /** True while this card's own apply or withdraw is in flight. */
  busy: boolean;
  error: string | null;
  onApply: (jobId: string) => void;
  onWithdraw: (jobId: string) => void;
};

export function VacancyCard({ vacancy, busy, error, onApply, onWithdraw }: VacancyCardProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Board");
  const servicesT = useTranslations("Services");
  const slots = describeOpenSlots(vacancy.openSlots, vacancy.crewSize);
  const state = toVacancyState(vacancy.applicationStatus);
  const service = getServiceLabel(
    { name: vacancy.serviceName, slug: vacancy.serviceSlug },
    servicesT,
  );
  const date = formatJobDate(vacancy.scheduledStart, locale);
  const time = formatJobTime(vacancy.scheduledStart, locale);
  const duration = formatJobDuration(vacancy.durationMinutes, locale);
  const pay = formatCleanerPay(vacancy.cleanerPayCents, locale);

  if (state.kind === "waiting") {
    return (
      <li className="vacancy-card vacancy-card--applied">
        <div className="vacancy-card__date-time">
          <span className="vacancy-card__date">{date}</span>
          <span className="vacancy-card__time">{time}</span>
        </div>
        <span className="vacancy-card__pay">{pay}</span>
        <p className="vacancy-card__site">
          {vacancy.siteName} · {vacancy.suburb}
        </p>
        <span className="visually-hidden">{vacancy.companyName}</span>
        <span className="visually-hidden">
          {slots.values ? t(slots.key, slots.values) : t(slots.key)}
        </span>
        <p aria-live="polite" className="vacancy-card__waiting" role="status">
          {t("appliedReassurance")}
        </p>
        {error ? (
          <p className="vacancy-card__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="vacancy-card__actions">
          <button
            className="button button--secondary button--small"
            disabled={busy}
            onClick={() => onWithdraw(vacancy.jobId)}
            type="button"
          >
            {busy ? t("withdrawing") : t("withdraw")}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="vacancy-card">
      <div className="vacancy-card__metrics">
        <div className="vacancy-card__date-time">
          <span className="vacancy-card__date">
            {date}
          </span>
          <span className="vacancy-card__time">
            {time}
          </span>
        </div>
        <span className="vacancy-card__duration">
          {duration}
        </span>
        <span className="vacancy-card__pay">
          {pay}
        </span>
      </div>

      <div className="vacancy-card__details">
        <p className="vacancy-card__company">{vacancy.companyName}</p>
        <p className="vacancy-card__where">
          {vacancy.siteName} · {vacancy.suburb}
        </p>
        <p className="vacancy-card__where">
          {service} ·{" "}
          <span className="vacancy-card__slots">
            {slots.values ? t(slots.key, slots.values) : t(slots.key)}
          </span>
        </p>
      </div>

      {state.kind === "closed" ? (
        <p className="vacancy-card__note">{t(state.reason)}</p>
      ) : null}

      {error ? (
        <p className="vacancy-card__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="vacancy-card__actions">
        <button
          className="button button--small"
          disabled={busy || state.kind === "closed"}
          onClick={() => onApply(vacancy.jobId)}
          type="button"
        >
          {busy ? t("applying") : t("apply")}
        </button>
      </div>
    </li>
  );
}
