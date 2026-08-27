import { useLocale, useTranslations } from "next-intl";

import {
  formatCleanerPay,
  formatJobDate,
  formatJobDuration,
  formatJobTime,
} from "@/features/board/format";
import { formatSeriesTime, formatSeriesWeekday } from "@/features/offers/format";
import type {
  CleanerOffer,
  OfferStatus,
  RecurrenceFrequency,
} from "@/features/offers/types";
import type { AppLocale } from "@/i18n/config";
import { getServiceLabel } from "@/i18n/service-label";

export type OfferAction = "accept" | "decline";

type OfferCardProps = {
  action: OfferAction | null;
  offer: CleanerOffer;
  onAccept: (offerId: string) => void;
  onDecline: (offerId: string) => void;
};

function statusKey(status: Exclude<OfferStatus, "pending">) {
  switch (status) {
    case "accepted":
      return "statusAccepted" as const;
    case "declined":
      return "statusDeclined" as const;
    case "revoked":
      return "statusRevoked" as const;
  }
}

function isResolvedStatus(status: OfferStatus): status is Exclude<OfferStatus, "pending"> {
  return status !== "pending";
}

function seriesScheduleKey(frequency: RecurrenceFrequency) {
  switch (frequency) {
    case "weekly":
      return "seriesScheduleWeekly" as const;
    case "fortnightly":
      return "seriesScheduleFortnightly" as const;
  }
}

export function OfferCard({ action, offer, onAccept, onDecline }: OfferCardProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Offers");
  const servicesT = useTranslations("Services");
  const service = getServiceLabel(
    { name: offer.serviceName, slug: offer.serviceSlug },
    servicesT,
  );
  const duration = formatJobDuration(offer.durationMinutes, locale);
  const pay = formatCleanerPay(offer.cleanerPayCents, locale);

  let schedule: string;
  switch (offer.target.kind) {
    case "job":
      schedule = t("jobSchedule", {
        date: formatJobDate(offer.target.scheduledStart, locale),
        time: formatJobTime(offer.target.scheduledStart, locale),
        duration,
      });
      break;
    case "recurring_assignment":
      schedule = t(seriesScheduleKey(offer.target.frequency), {
        weekday: formatSeriesWeekday(offer.target.weekday, locale),
        time: formatSeriesTime(offer.target.localStartTime, locale),
        duration,
      });
      break;
  }

  const pending = offer.status === "pending";

  return (
    <li className={`offer-card${pending ? "" : " offer-card--resolved"}`} data-offer-id={offer.id}>
      <div className="offer-card__head">
        <div>
          <p className="offer-card__company">{offer.companyName}</p>
          <p className="offer-card__site">
            {offer.siteName} · {offer.suburb}
          </p>
        </div>
        <div className="offer-card__pay">
          <span>{t("payLabel")}</span>
          <strong>{pay}</strong>
        </div>
      </div>

      <div className="offer-card__details">
        <p>{service}</p>
        <p>{schedule}</p>
        <p>{t("crewSize", { count: offer.crewSize })}</p>
      </div>

      {pending && offer.target.kind === "recurring_assignment" ? (
        <p className="offer-card__consent">{t("seriesConsent")}</p>
      ) : null}

      {isResolvedStatus(offer.status) ? (
        <span className={`offer-status offer-status--${offer.status}`}>
          {t(statusKey(offer.status))}
        </span>
      ) : (
        <div className="offer-card__actions">
          <button
            className="button button--small"
            disabled={action !== null}
            onClick={() => onAccept(offer.id)}
            type="button"
          >
            {action === "accept" ? t("accepting") : t("accept")}
          </button>
          <button
            className="button button--secondary button--small"
            disabled={action !== null}
            onClick={() => onDecline(offer.id)}
            type="button"
          >
            {action === "decline" ? t("declining") : t("decline")}
          </button>
        </div>
      )}
    </li>
  );
}
