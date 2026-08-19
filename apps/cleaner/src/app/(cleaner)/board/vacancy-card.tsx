import { toVacancyState } from "@/features/board/application";
import {
  describeOpenSlots,
  formatCleanerPay,
  formatJobDate,
  formatJobDuration,
  formatJobTime,
} from "@/features/board/format";
import type { Vacancy } from "@/features/board/types";

type VacancyCardProps = {
  vacancy: Vacancy;
  /** True while this card's own apply or withdraw is in flight. */
  busy: boolean;
  error: string | null;
  onApply: (jobId: string) => void;
  onWithdraw: (jobId: string) => void;
};

export function VacancyCard({ vacancy, busy, error, onApply, onWithdraw }: VacancyCardProps) {
  const slots = describeOpenSlots(vacancy.openSlots, vacancy.crewSize);
  const state = toVacancyState(vacancy.applicationStatus);

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

      {state.kind === "waiting" ? (
        <span className="vacancy-card__waiting">Waiting to hear back</span>
      ) : null}

      {state.kind === "closed" ? <p className="vacancy-card__note">{state.reason}</p> : null}

      {error ? (
        <p className="vacancy-card__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="vacancy-card__actions">
        {state.kind === "waiting" ? (
          <button
            className="button button--secondary button--small"
            disabled={busy}
            onClick={() => onWithdraw(vacancy.jobId)}
            type="button"
          >
            {busy ? "Withdrawing…" : "Withdraw"}
          </button>
        ) : (
          <button
            className="button button--small"
            disabled={busy || state.kind === "closed"}
            onClick={() => onApply(vacancy.jobId)}
            type="button"
          >
            {busy ? "Applying…" : "Apply"}
          </button>
        )}
      </div>
    </li>
  );
}
