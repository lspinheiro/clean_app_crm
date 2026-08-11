"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useRef, useState } from "react";

import { assignJobSlot, cancelJob } from "@/app/actions/jobs";
import {
  formatCleanerPay,
  formatJobDate,
  formatJobDuration,
  formatJobStatus,
  formatJobTime,
} from "@/features/jobs/format";
import type {
  JobApplicationStatus,
  JobDetail,
  JobPoolCandidate,
} from "@/features/jobs/types";

const applicationLabels: Record<JobApplicationStatus, string> = {
  applied: "Applied",
  assigned: "Assigned",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
};

const cancellableStatuses: JobDetail["status"][] = [
  "draft",
  "posted",
  "assigned",
  "on_the_way",
  "in_progress",
];

function candidateLabel(candidate: JobPoolCandidate) {
  return candidate.preferredRank === null
    ? candidate.cleanerName
    : `${candidate.cleanerName} — preferred #${candidate.preferredRank}`;
}

export function JobDetailWorkspace({ job }: { job: JobDetail }) {
  const router = useRouter();
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const [selectedBySlot, setSelectedBySlot] = useState<Record<number, string>>({});
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [slotError, setSlotError] = useState<{ slot: number; message: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const appliedCandidates = useMemo(
    () =>
      job.applicants
        .filter((applicant) => applicant.status === "applied")
        .map((applicant) => ({
          cleanerId: applicant.cleanerId,
          cleanerName: applicant.cleanerName,
          preferredRank: applicant.preferredRank,
        })),
    [job.applicants],
  );
  const directCandidates = useMemo(() => {
    const appliedIds = new Set(
      job.applicants
        .filter((applicant) => applicant.status === "applied")
        .map((applicant) => applicant.cleanerId),
    );
    const withdrawnIds = new Set(
      job.applicants
        .filter((applicant) => applicant.status === "withdrawn")
        .map((applicant) => applicant.cleanerId),
    );
    return job.poolCandidates.filter(
      (candidate) =>
        !appliedIds.has(candidate.cleanerId) &&
        !withdrawnIds.has(candidate.cleanerId),
    );
  }, [job.applicants, job.poolCandidates]);
  const allCandidates = [...appliedCandidates, ...directCandidates];
  const candidatesById = new Map(
    allCandidates.map((candidate) => [candidate.cleanerId, candidate]),
  );
  const canAssign = job.status === "draft" || job.status === "posted";
  const canCancel = cancellableStatuses.includes(job.status);

  async function handleAssign(event: FormEvent<HTMLFormElement>, slotNumber: number) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusySlot(slotNumber);
    setSlotError(null);
    try {
      const result = await assignJobSlot(formData);
      if (!result.ok) {
        setSlotError({ slot: slotNumber, message: result.formError });
      }
    } catch {
      setSlotError({
        slot: slotNumber,
        message:
          "The assignment could not be confirmed. Review the refreshed crew slots before trying again.",
      });
    } finally {
      router.refresh();
      setBusySlot(null);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await cancelJob(job.id);
      if (!result.ok) setCancelError(result.formError);
      cancelDialog.current?.close();
    } catch {
      setCancelError(
        "The cancellation could not be confirmed. Review the refreshed job before trying again.",
      );
      cancelDialog.current?.close();
    } finally {
      router.refresh();
      setCancelling(false);
    }
  }

  return (
    <>
      <Link className="back-link" href="/jobs">
        <ArrowLeft aria-hidden="true" size={18} />
        Back to jobs
      </Link>

      <header className="job-detail-header">
        <div>
          <p className="eyebrow">Job detail</p>
          <div className="job-detail-title-line">
            <h1 className="page-heading">{job.site.name}</h1>
            <span className={`status-chip status-chip--${job.status}`}>
              {formatJobStatus(job.status)}
            </span>
          </div>
          <p className="job-detail-context">
            <span>{job.clientName}</span>
            <span aria-hidden="true">·</span>
            <span>{job.serviceName}</span>
          </p>
        </div>
        {canCancel ? (
          <button
            className="button button--secondary button--danger"
            onClick={() => cancelDialog.current?.showModal()}
            type="button"
          >
            Cancel job
          </button>
        ) : null}
      </header>

      {cancelError && canCancel ? (
        <p className="job-operation-error" role="alert">
          {cancelError}
        </p>
      ) : null}

      <section aria-labelledby="job-overview-heading" className="job-detail-section">
        <div className="job-detail-section__heading">
          <p className="record-kicker">Overview</p>
          <h2 id="job-overview-heading">Schedule and site</h2>
        </div>
        <dl className="job-detail-facts">
          <div>
            <dt>Date</dt>
            <dd>
              <time dateTime={job.scheduledStart}>
                {formatJobDate(job.scheduledStart)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Start</dt>
            <dd className="tabular-numerals">{formatJobTime(job.scheduledStart)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd className="tabular-numerals">{formatJobDuration(job.durationMinutes)}</dd>
          </div>
          <div className="job-detail-fact--wide">
            <dt>Site address</dt>
            <dd>{job.site.address} · {job.site.suburb}</dd>
          </div>
          <div className="job-detail-fact--wide">
            <dt>Access notes</dt>
            <dd>{job.site.accessNotes || "No access notes recorded."}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="job-commercial-heading" className="job-detail-section">
        <div className="job-detail-section__heading">
          <p className="record-kicker">Admin only</p>
          <h2 id="job-commercial-heading">Commercial detail</h2>
        </div>
        <dl className="job-commercial-facts">
          <div>
            <dt>Cleaner pay per slot</dt>
            <dd className="tabular-numerals">{formatCleanerPay(job.cleanerPayCents)}</dd>
          </div>
          <div>
            <dt>Client charge</dt>
            <dd className="tabular-numerals">
              {job.clientChargeCents === null
                ? "Not recorded"
                : formatCleanerPay(job.clientChargeCents)}
            </dd>
          </div>
          <div className="job-detail-fact--wide">
            <dt>Internal notes</dt>
            <dd>{job.notes || "No internal notes recorded."}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="job-crew-heading"
        className="job-detail-section job-crew-section"
      >
        <div className="job-detail-section__heading">
          <p className="record-kicker">Crew</p>
          <h2 id="job-crew-heading">Crew slots</h2>
          <p>{job.slots.filter((slot) => slot.state === "assigned").length}/{job.crewSize} assigned</p>
        </div>
        <div aria-label="Crew slots" className="job-slot-list" role="region">
          {job.slots.map((slot) => {
            const selectedCleanerId = selectedBySlot[slot.slotNumber] ?? "";
            const selectedCleaner = candidatesById.get(selectedCleanerId);
            const showAssignment = canAssign && slot.state !== "assigned";
            const slotStateLabel =
              job.status === "cancelled" && slot.state === "open"
                ? "Closed"
                : showAssignment
                  ? "Open"
                : slot.state === "assigned"
                  ? "Assigned"
                  : slot.state === "released"
                    ? "Released"
                    : "Open";
            const slotStateDetail =
              showAssignment && slot.state === "released" && slot.cleanerName
                ? `Previously assigned to ${slot.cleanerName}`
                : slot.cleanerName ??
                  (showAssignment
                    ? "Choose an applicant or pool cleaner"
                    : "No active assignment");
            return (
              <article
                aria-label={`Crew slot ${slot.slotNumber}`}
                className="job-slot-row"
                key={slot.slotNumber}
              >
                <div className="job-slot-number" aria-hidden="true">
                  {slot.slotNumber}
                </div>
                <div className="job-slot-state">
                  <strong>{slotStateLabel}</strong>
                  <span>{slotStateDetail}</span>
                </div>
                {showAssignment && allCandidates.length ? (
                  <form
                    className="job-slot-assignment"
                    onSubmit={(event) => handleAssign(event, slot.slotNumber)}
                  >
                    <input name="jobId" type="hidden" value={job.id} />
                    <input name="slotNumber" type="hidden" value={slot.slotNumber} />
                    <label htmlFor={`slot-${slot.slotNumber}-cleaner`}>
                      Cleaner for slot {slot.slotNumber}
                    </label>
                    <select
                      id={`slot-${slot.slotNumber}-cleaner`}
                      name="cleanerId"
                      onChange={(event) =>
                        setSelectedBySlot((current) => ({
                          ...current,
                          [slot.slotNumber]: event.target.value,
                        }))
                      }
                      value={selectedCleanerId}
                    >
                      <option value="">Choose a cleaner</option>
                      {appliedCandidates.length ? (
                        <optgroup label="Applicants">
                          {appliedCandidates.map((candidate) => (
                            <option key={candidate.cleanerId} value={candidate.cleanerId}>
                              {candidateLabel(candidate)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {directCandidates.length ? (
                        <optgroup label="Pool members">
                          {directCandidates.map((candidate) => (
                            <option key={candidate.cleanerId} value={candidate.cleanerId}>
                              {candidateLabel(candidate)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                    <button
                      aria-label={
                        selectedCleaner
                          ? `Assign ${selectedCleaner.cleanerName} to slot ${slot.slotNumber}`
                          : `Assign cleaner to slot ${slot.slotNumber}`
                      }
                      className="button button--small"
                      disabled={!selectedCleaner || busySlot !== null}
                      type="submit"
                    >
                      {busySlot === slot.slotNumber ? "Assigning…" : "Assign"}
                    </button>
                  </form>
                ) : showAssignment ? (
                  <p className="job-slot-empty">
                    No active pool cleaners are available to assign.
                  </p>
                ) : null}
                {slotError?.slot === slot.slotNumber && showAssignment ? (
                  <p className="job-operation-error job-slot-error" role="alert">
                    {slotError.message}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="job-applicants-heading" className="job-detail-section">
        <div className="job-detail-section__heading">
          <p className="record-kicker">Pool response</p>
          <h2 id="job-applicants-heading">Applicants</h2>
          <p>Site preferences set the order; status text records the outcome.</p>
        </div>
        {job.applicants.length ? (
          <ul aria-label="Job applicants" className="job-applicant-list">
            {job.applicants.map((applicant) => (
              <li key={applicant.cleanerId}>
                <div>
                  <strong>{applicant.cleanerName}</strong>
                  {applicant.preferredRank === null ? null : (
                    <span className="preference-label">
                      Preferred #{applicant.preferredRank}
                    </span>
                  )}
                </div>
                <span className={`application-chip application-chip--${applicant.status}`}>
                  {applicationLabels[applicant.status]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="job-applicants-empty">No applications yet.</p>
        )}
      </section>

      <dialog
        aria-labelledby="cancel-job-title"
        className="record-dialog job-cancel-dialog"
        ref={cancelDialog}
      >
        <div className="dialog-form">
          <header className="dialog-header">
            <p className="record-kicker">Close every open slot</p>
            <h2 id="cancel-job-title">Cancel this job?</h2>
            <p>
              Active assignments will be released, vacancies will close, and affected
              cleaners will see the cancellation.
            </p>
          </header>
          <div className="dialog-actions">
            <button
              className="button button--secondary"
              disabled={cancelling}
              onClick={() => cancelDialog.current?.close()}
              type="button"
            >
              Keep job
            </button>
            <button
              className="button button--danger-solid"
              disabled={cancelling}
              onClick={handleCancel}
              type="button"
            >
              {cancelling ? "Cancelling…" : "Confirm cancellation"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
