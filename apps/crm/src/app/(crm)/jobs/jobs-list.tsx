import { Clock3, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  formatCleanerPay,
  formatJobDate,
  formatJobDuration,
  formatJobStatus,
  formatJobTime,
} from "@/features/jobs/format";
import type { JobSummary } from "@/features/jobs/types";
import type { AppLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";

type JobsListProps = {
  jobs: JobSummary[];
};

export function JobsList({ jobs }: JobsListProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Jobs");
  if (!jobs.length) {
    return (
      <section className="jobs-empty">
        <h2>{t("noJobsTitle")}</h2>
        <p>{t("noJobsDescription")}</p>
      </section>
    );
  }

  return (
    <ul aria-label={t("companyJobs")} className="job-list">
      {jobs.map((job) => (
        <li className="job-list-item" key={job.id}>
          <Link
            className="job-list-link"
            href={`/jobs/${job.id}`}
          >
            <time className="job-date" dateTime={job.scheduledStart}>
              {formatJobDate(job.scheduledStart, locale)}
            </time>
            <div className="job-primary">
              <div className="job-title-line">
                <h2>{job.siteName}</h2>
                <span className={`status-chip status-chip--${job.status}`}>
                  {formatJobStatus(job.status, locale)}
                </span>
              </div>
              <p>{job.clientName} · {job.serviceName}</p>
              <div className="job-facts">
                <span>
                  <Clock3 aria-hidden="true" size={16} />
                  <span className="tabular-numerals">
                    {formatJobTime(job.scheduledStart, locale)} · {formatJobDuration(job.durationMinutes, locale)}
                  </span>
                </span>
                <span>
                  <Users aria-hidden="true" size={16} />
                  <span className="tabular-numerals">
                    {t("assignedCount", {
                      assigned: job.assignedSlots,
                      total: job.crewSize,
                    })}
                  </span>
                </span>
              </div>
            </div>
            <div className="job-pay">
              <span>{t("cleanerPay")}</span>
              <strong className="tabular-numerals">
                {formatCleanerPay(job.cleanerPayCents, locale)}
                <small>{t("perSlot")}</small>
              </strong>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
