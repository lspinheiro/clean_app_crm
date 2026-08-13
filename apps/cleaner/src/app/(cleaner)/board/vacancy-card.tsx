import {
  describeOpenSlots,
  formatCleanerPay,
  formatJobDate,
  formatJobDuration,
  formatJobTime,
} from "@/features/board/format";
import type { Vacancy } from "@/features/board/types";

export function VacancyCard({ vacancy }: { vacancy: Vacancy }) {
  const slots = describeOpenSlots(vacancy.openSlots, vacancy.crewSize);

  return (
    <li className="vacancy-card">
      <div className="vacancy-card__head">
        <div>
          <p className="vacancy-card__company">{vacancy.companyName}</p>
          <p className="vacancy-card__when">
            {formatJobDate(vacancy.scheduledStart)} · {formatJobTime(vacancy.scheduledStart)}
          </p>
          <p className="vacancy-card__where">
            {vacancy.siteName} · {vacancy.suburb}
          </p>
          <p className="vacancy-card__where">
            {vacancy.serviceName} · {formatJobDuration(vacancy.durationMinutes)}
          </p>
        </div>
        <span className="vacancy-card__pay">{formatCleanerPay(vacancy.cleanerPayCents)}</span>
      </div>
      {slots ? <span className="vacancy-card__slots">{slots}</span> : null}
    </li>
  );
}
