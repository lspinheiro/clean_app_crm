"use client";

import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
  JobCleanerCandidate,
  JobSlot,
} from "@/features/jobs/types";
import type { AppLocale } from "@/i18n/config";
import { Link, useRouter } from "@/i18n/navigation";
import { localiseUserMessage } from "@/i18n/user-message";

type ApplicationLabelKey =
  | "applicationApplied"
  | "applicationAssigned"
  | "applicationNotSelected"
  | "applicationWithdrawn";

const applicationLabelKeys = {
  applied: "applicationApplied",
  assigned: "applicationAssigned",
  not_selected: "applicationNotSelected",
  withdrawn: "applicationWithdrawn",
} as const satisfies Record<JobApplicationStatus, ApplicationLabelKey>;

const cancellableStatuses: JobDetail["status"][] = [
  "draft",
  "posted",
  "assigned",
  "on_the_way",
  "in_progress",
];

type HelperMessageKey =
  | "chooseApplicant"
  | "noActiveAssignment"
  | "preferredCandidate"
  | "previouslyAssigned"
  | "slotAssigned"
  | "slotClosed"
  | "slotOpen";

type Translator = (
  key: HelperMessageKey,
  values?: Record<string, string | number>,
) => string;

function candidateLabel(candidate: JobCleanerCandidate, t: Translator) {
  return candidate.preferredRank === null
    ? candidate.cleanerName
    : t("preferredCandidate", {
        cleanerName: candidate.cleanerName,
        rank: candidate.preferredRank,
      });
}

function assertNever(value: never): never {
  throw new Error(`Unexpected job slot state: ${JSON.stringify(value)}`);
}

function slotPresentation(slot: JobSlot, t: Translator) {
  switch (slot.state) {
    case "assigned":
      return {
        label: t("slotAssigned"),
        detail: slot.assignment.cleanerName,
      };
    case "open":
      return {
        label: t("slotOpen"),
        detail: slot.previousAssignment
          ? t("previouslyAssigned", {
              cleanerName: slot.previousAssignment.cleanerName,
            })
          : t("chooseApplicant"),
      };
    case "closed":
      return {
        label: t("slotClosed"),
        detail: slot.previousAssignment
          ? t("previouslyAssigned", {
              cleanerName: slot.previousAssignment.cleanerName,
            })
          : t("noActiveAssignment"),
      };
    default:
      return assertNever(slot);
  }
}

function slotLifecycleKey(jobId: string, slot: JobSlot) {
  switch (slot.state) {
    case "assigned":
      return [
        jobId,
        slot.slotNumber,
        slot.state,
        slot.assignment.cleanerId,
        slot.assignment.assignedAt,
      ].join(":");
    case "open":
    case "closed":
      return [
        jobId,
        slot.slotNumber,
        slot.state,
        slot.previousAssignment?.cleanerId ?? "none",
        slot.previousAssignment?.assignedAt ?? "none",
        slot.previousAssignment?.releasedAt ?? "none",
      ].join(":");
    default:
      return assertNever(slot);
  }
}

export function JobDetailWorkspace({ job }: { job: JobDetail }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Jobs");
  const router = useRouter();
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const [selectedBySlot, setSelectedBySlot] = useState<Record<string, string>>({});
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<{
    slotKey: string;
    message: string;
  } | null>(null);
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
    return job.cleanerCandidates.filter(
      (candidate) =>
        !appliedIds.has(candidate.cleanerId) &&
        !withdrawnIds.has(candidate.cleanerId),
    );
  }, [job.applicants, job.cleanerCandidates]);
  const allCandidates = [...appliedCandidates, ...directCandidates];
  const candidatesById = new Map(
    allCandidates.map((candidate) => [candidate.cleanerId, candidate]),
  );
  const canAssign = job.status === "draft" || job.status === "posted";
  const canCancel = cancellableStatuses.includes(job.status);

  async function handleAssign(
    event: FormEvent<HTMLFormElement>,
    slotKey: string,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusySlot(slotKey);
    setSlotError(null);
    try {
      const result = await assignJobSlot(formData);
      if (!result.ok) {
        setSlotError({
          slotKey,
          message: localiseUserMessage(result.formError, locale) ?? result.formError,
        });
      }
    } catch {
      setSlotError({
        slotKey,
        message:
          t("assignmentNotConfirmed"),
      });
    } finally {
      router.refresh();
      setSelectedBySlot((current) => {
        const next = { ...current };
        delete next[slotKey];
        return next;
      });
      setBusySlot(null);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await cancelJob(job.id);
      if (!result.ok) {
        setCancelError(
          localiseUserMessage(result.formError, locale) ?? result.formError,
        );
      }
      cancelDialog.current?.close();
    } catch {
      setCancelError(
        t("cancellationNotConfirmed"),
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
        {t("back")}
      </Link>

      <header className="job-detail-header">
        <div>
          <p className="eyebrow">{t("detailEyebrow")}</p>
          <div className="job-detail-title-line">
            <h1 className="page-heading">{job.site.name}</h1>
            <span className={`status-chip status-chip--${job.status}`}>
              {formatJobStatus(job.status, t)}
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
            {t("cancelJob")}
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
          <p className="record-kicker">{t("overview")}</p>
          <h2 id="job-overview-heading">{t("scheduleAndSite")}</h2>
        </div>
        <dl className="job-detail-facts">
          <div>
            <dt>{t("detailDate")}</dt>
            <dd>
              <time dateTime={job.scheduledStart}>
                {formatJobDate(job.scheduledStart, locale)}
              </time>
            </dd>
          </div>
          <div>
            <dt>{t("start")}</dt>
            <dd className="tabular-numerals">{formatJobTime(job.scheduledStart, locale)}</dd>
          </div>
          <div>
            <dt>{t("detailDuration")}</dt>
            <dd className="tabular-numerals">{formatJobDuration(job.durationMinutes, locale)}</dd>
          </div>
          <div className="job-detail-fact--wide">
            <dt>{t("siteAddress")}</dt>
            <dd>{job.site.address} · {job.site.suburb}</dd>
          </div>
          <div className="job-detail-fact--wide">
            <dt>{t("accessNotes")}</dt>
            <dd>{job.site.accessNotes || t("noAccessNotes")}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="job-commercial-heading" className="job-detail-section">
        <div className="job-detail-section__heading">
          <p className="record-kicker">{t("adminOnly")}</p>
          <h2 id="job-commercial-heading">{t("commercialDetail")}</h2>
        </div>
        <dl className="job-commercial-facts">
          <div>
            <dt>{t("cleanerPayPerSlotLabel")}</dt>
            <dd className="tabular-numerals">{formatCleanerPay(job.cleanerPayCents, locale)}</dd>
          </div>
          <div>
            <dt>{t("clientChargeLabel")}</dt>
            <dd className="tabular-numerals">
              {job.clientChargeCents === null
                ? t("notRecorded")
                : formatCleanerPay(job.clientChargeCents, locale)}
            </dd>
          </div>
          <div className="job-detail-fact--wide">
            <dt>{t("internalNotesLabel")}</dt>
            <dd>{job.notes || t("noInternalNotes")}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="job-crew-heading"
        className="job-detail-section job-crew-section"
      >
        <div className="job-detail-section__heading">
          <p className="record-kicker">{t("crew")}</p>
          <h2 id="job-crew-heading">{t("crewSlots")}</h2>
          <p>{t("assignedCount", {
            assigned: job.slots.filter((slot) => slot.state === "assigned").length,
            total: job.crewSize,
          })}</p>
        </div>
        <div aria-label={t("crewSlots")} className="job-slot-list" role="region">
          {job.slots.map((slot) => {
            const slotKey = slotLifecycleKey(job.id, slot);
            const selectedCleanerId = selectedBySlot[slotKey] ?? "";
            const selectedCleaner = candidatesById.get(selectedCleanerId);
            const showAssignment = canAssign && slot.state === "open";
            const presentation = slotPresentation(slot, t);
            return (
              <article
                aria-label={t("crewSlot", { slot: slot.slotNumber })}
                className="job-slot-row"
                key={slotKey}
              >
                <div className="job-slot-number" aria-hidden="true">
                  {slot.slotNumber}
                </div>
                <div className="job-slot-state">
                  <strong>{presentation.label}</strong>
                  <span>{presentation.detail}</span>
                </div>
                {showAssignment && allCandidates.length ? (
                  <form
                    className="job-slot-assignment"
                    onSubmit={(event) => handleAssign(event, slotKey)}
                  >
                    <input name="jobId" type="hidden" value={job.id} />
                    <input name="slotNumber" type="hidden" value={slot.slotNumber} />
                    <label htmlFor={`slot-${slot.slotNumber}-cleaner`}>
                      {t("cleanerForSlot", { slot: slot.slotNumber })}
                    </label>
                    <select
                      id={`slot-${slot.slotNumber}-cleaner`}
                      name="cleanerId"
                      onChange={(event) =>
                        setSelectedBySlot((current) => ({
                          ...current,
                          [slotKey]: event.target.value,
                        }))
                      }
                      value={selectedCleanerId}
                    >
                      <option value="">{t("chooseCleaner")}</option>
                      {appliedCandidates.length ? (
                        <optgroup label={t("applicantsGroup")}>
                          {appliedCandidates.map((candidate) => (
                            <option key={candidate.cleanerId} value={candidate.cleanerId}>
                              {candidateLabel(candidate, t)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {directCandidates.length ? (
                        <optgroup label={t("cleanersGroup")}>
                          {directCandidates.map((candidate) => (
                            <option key={candidate.cleanerId} value={candidate.cleanerId}>
                              {candidateLabel(candidate, t)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                    <button
                      aria-label={
                        selectedCleaner
                          ? t("assignSelected", {
                              cleanerName: selectedCleaner.cleanerName,
                              slot: slot.slotNumber,
                            })
                          : t("assignSlot", { slot: slot.slotNumber })
                      }
                      className="button button--small"
                      disabled={!selectedCleaner || busySlot !== null}
                      type="submit"
                    >
                      {busySlot === slotKey ? t("assigning") : t("assign")}
                    </button>
                  </form>
                ) : showAssignment ? (
                  <p className="job-slot-empty">
                    {t("noCleanerCandidates")}
                  </p>
                ) : null}
                {slotError?.slotKey === slotKey && showAssignment ? (
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
          <p className="record-kicker">{t("cleanerResponse")}</p>
          <h2 id="job-applicants-heading">{t("applicants")}</h2>
          <p>{t("applicantsDescription")}</p>
        </div>
        {job.applicants.length ? (
          <ul aria-label={t("jobApplicants")} className="job-applicant-list">
            {job.applicants.map((applicant) => (
              <li key={applicant.cleanerId}>
                <div>
                  <strong>{applicant.cleanerName}</strong>
                  {applicant.preferredRank === null ? null : (
                    <span className="preference-label">
                      {t("preferredRank", { rank: applicant.preferredRank })}
                    </span>
                  )}
                </div>
                <span className={`application-chip application-chip--${applicant.status}`}>
                  {t(applicationLabelKeys[applicant.status])}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="job-applicants-empty">{t("noApplications")}</p>
        )}
      </section>

      <dialog
        aria-labelledby="cancel-job-title"
        className="record-dialog job-cancel-dialog"
        ref={cancelDialog}
      >
        <div className="dialog-form">
          <header className="dialog-header">
            <p className="record-kicker">{t("closeOpenSlots")}</p>
            <h2 id="cancel-job-title">{t("cancelQuestion")}</h2>
            <p>{t("cancelDescription")}</p>
          </header>
          <div className="dialog-actions">
            <button
              className="button button--secondary"
              disabled={cancelling}
              onClick={() => cancelDialog.current?.close()}
              type="button"
            >
              {t("keepJob")}
            </button>
            <button
              className="button button--danger-solid"
              disabled={cancelling}
              onClick={handleCancel}
              type="button"
            >
              {cancelling ? t("cancelling") : t("confirmCancellation")}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
