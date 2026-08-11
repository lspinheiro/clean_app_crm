import { Clock3, Users } from "lucide-react";
import Link from "next/link";

import {
  formatCleanerPay,
  formatJobDate,
  formatJobDuration,
  formatJobStatus,
  formatJobTime,
} from "@/features/jobs/format";
import type { JobSummary } from "@/features/jobs/types";

type JobsListProps = {
  jobs: JobSummary[];
};

export function JobsList({ jobs }: JobsListProps) {
  if (!jobs.length) {
    return (
      <section className="jobs-empty">
        <h2>No jobs yet</h2>
        <p>Recurring assignments will place the company&apos;s real week here.</p>
      </section>
    );
  }

  return (
    <ul aria-label="Company jobs" className="job-list">
      {jobs.map((job) => (
        <li className="job-list-item" key={job.id}>
          <Link
            className="job-list-link"
            href={`/jobs/${job.id}`}
          >
            <time className="job-date" dateTime={job.scheduledStart}>
              {formatJobDate(job.scheduledStart)}
            </time>
            <div className="job-primary">
              <div className="job-title-line">
                <h2>{job.siteName}</h2>
                <span className={`status-chip status-chip--${job.status}`}>
                  {formatJobStatus(job.status)}
                </span>
              </div>
              <p>{job.clientName} · {job.serviceName}</p>
              <div className="job-facts">
                <span>
                  <Clock3 aria-hidden="true" size={16} />
                  <span className="tabular-numerals">
                    {formatJobTime(job.scheduledStart)} · {formatJobDuration(job.durationMinutes)}
                  </span>
                </span>
                <span>
                  <Users aria-hidden="true" size={16} />
                  <span className="tabular-numerals">
                    {job.assignedSlots}/{job.crewSize} assigned
                  </span>
                </span>
              </div>
            </div>
            <div className="job-pay">
              <span>Cleaner pay</span>
              <strong className="tabular-numerals">
                {formatCleanerPay(job.cleanerPayCents)}<small>/slot</small>
              </strong>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
