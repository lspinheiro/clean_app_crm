import { useLocale, useTranslations } from "next-intl";

import {
  formatCleanerPay,
  formatJobDate,
  formatJobDuration,
  formatJobTime,
} from "@/features/board/format";
import { toMapsUrl } from "@/features/my-jobs/access";
import { toJobAction } from "@/features/my-jobs/status";
import type { JobStatus, MyJob } from "@/features/my-jobs/types";
import type { AppLocale } from "@/i18n/config";
import { getServiceLabel } from "@/i18n/service-label";

/** What `get_cleaner_job_access` returned for this job, once she has asked for it. */
export type JobAccess = { address: string; accessNotes: string };

type MyJobCardProps = {
  job: MyJob;
  /** True while this card's own status change or address fetch is in flight. */
  busy: boolean;
  /** Null until she taps Show address. The card never fetches; the page does. */
  access: JobAccess | null;
  /** True while this card is holding a job-done confirmation open. */
  confirming: boolean;
  error: string | null;
  onAdvance: (jobId: string, to: JobStatus) => void;
  onShowAddress: (jobId: string) => void;
  onConfirmToggle: (jobId: string) => void;
};

export function MyJobCard({
  job,
  busy,
  access,
  confirming,
  error,
  onAdvance,
  onShowAddress,
  onConfirmToggle,
}: MyJobCardProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("MyJobs");
  const servicesT = useTranslations("Services");
  const action = toJobAction(job.status, locale);
  const service = getServiceLabel({ name: job.serviceName, slug: job.serviceSlug }, servicesT);

  return (
    <li className="my-job-card">
      <div className="my-job-card__head">
        <div>
          <p className="my-job-card__company">{job.companyName}</p>
          <p className="my-job-card__when">
            {formatJobDate(job.scheduledStart, locale)} ·{" "}
            {formatJobTime(job.scheduledStart, locale)}
          </p>
          <p className="my-job-card__where">
            {job.siteName} · {job.suburb}
          </p>
          <p className="my-job-card__where">
            {service} · {formatJobDuration(job.durationMinutes, locale)}
          </p>
        </div>
        <span className="my-job-card__pay">
          {formatCleanerPay(job.cleanerPayCents, locale)}
        </span>
      </div>

      {access ? (
        <div className="my-job-card__access">
          <p className="my-job-card__address">{access.address}</p>
          {access.accessNotes ? (
            <p className="my-job-card__notes">{access.accessNotes}</p>
          ) : null}
          <a
            className="button button--secondary button--small"
            href={toMapsUrl(access.address)}
            rel="noreferrer"
            target="_blank"
          >
            {t("maps")}
          </a>
        </div>
      ) : (
        <button
          className="button button--secondary button--small"
          disabled={busy}
          onClick={() => onShowAddress(job.jobId)}
          type="button"
        >
          {t("showAddress")}
        </button>
      )}

      {action.kind === "waiting" ? (
        <p className="my-job-card__note">{action.reason}</p>
      ) : null}

      {confirming ? (
        <p className="my-job-card__warning">{t("finishWarning")}</p>
      ) : null}

      {error ? (
        <p className="my-job-card__error" role="alert">
          {error}
        </p>
      ) : null}

      {action.kind === "waiting" ? null : (
        <div className="my-job-card__actions">
          <button
            className="button button--small"
            disabled={busy}
            onClick={() => {
              if (action.kind === "advance" || confirming) {
                return onAdvance(job.jobId, action.to);
              }
              return onConfirmToggle(job.jobId);
            }}
            type="button"
          >
            {busy
              ? action.busyLabel
              : action.kind === "confirm" && confirming
                ? action.confirmLabel
                : action.label}
          </button>
        </div>
      )}
    </li>
  );
}
