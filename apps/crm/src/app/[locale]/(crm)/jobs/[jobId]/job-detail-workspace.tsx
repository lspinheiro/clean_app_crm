"use client";

import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Ellipsis, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  approveJobApplication,
  assignJobSlot,
  cancelJob,
  markJobApplicationNotSelected,
  restoreJobApplication,
} from "@/app/actions/jobs";
import {
  formatCleanerPay,
  formatJobDate,
  formatJobDuration,
  formatJobStatus,
  formatJobTime,
} from "@/features/jobs/format";
import type {
  JobApplicant,
  JobApplicationStatus,
  JobDetail,
  JobCleanerCandidate,
  JobSlot,
} from "@/features/jobs/types";
import type { AppLocale } from "@/i18n/config";
import { Link, useRouter } from "@/i18n/navigation";
import { localiseUserMessage } from "@/i18n/user-message";
import { createClient } from "@/lib/supabase/browser";

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

type ApplicationReviewAction = "approve" | "not_selected" | "restore";

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
      return { label: t("slotAssigned"), detail: slot.assignment.cleanerName };
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

function applicantInitials(applicant: JobApplicant) {
  return applicant.cleanerName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function JobDetailWorkspace({ job }: { job: JobDetail }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Jobs");
  const router = useRouter();
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const jobActionsMenu = useRef<HTMLDetailsElement>(null);
  const jobActionsTrigger = useRef<HTMLElement>(null);
  const [selectedBySlot, setSelectedBySlot] = useState<Record<string, string>>({});
  const [selectedReviewSlot, setSelectedReviewSlot] = useState<Record<string, string>>({});
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [pendingReview, setPendingReview] = useState<{
    action: ApplicationReviewAction;
    cleanerId: string;
  } | null>(null);
  const [slotError, setSlotError] = useState<{ slotKey: string; message: string } | null>(null);
  const [reviewError, setReviewError] = useState<{ cleanerId: string; message: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const openSlots = useMemo(
    () => job.slots.filter((slot): slot is Extract<JobSlot, { state: "open" }> => (
      slot.state === "open"
    )),
    [job.slots],
  );
  const awaitingApplicants = useMemo(
    () => job.applicants.filter((applicant) => applicant.status === "applied"),
    [job.applicants],
  );
  const resolvedApplicants = useMemo(
    () => job.applicants.filter((applicant) => applicant.status !== "applied"),
    [job.applicants],
  );
  const directCandidates = useMemo(() => {
    const applicantIds = new Set(job.applicants.map((applicant) => applicant.cleanerId));
    return job.cleanerCandidates.filter(
      (candidate) => !applicantIds.has(candidate.cleanerId),
    );
  }, [job.applicants, job.cleanerCandidates]);
  const directCandidatesById = new Map(
    directCandidates.map((candidate) => [candidate.cleanerId, candidate]),
  );
  const canAssign = job.status === "draft" || job.status === "posted";
  const canReview = job.status === "posted" && openSlots.length > 0;
  const canCancel = cancellableStatuses.includes(job.status);
  const assignedCount = job.slots.filter((slot) => slot.state === "assigned").length;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`job-applications:${job.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_applications",
          filter: `job_id=eq.${job.id}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [job.id, router]);

  useEffect(() => {
    function closeJobActionsFromOutside(event: PointerEvent) {
      const menu = jobActionsMenu.current;
      if (menu?.open && !event.composedPath().includes(menu)) {
        menu.open = false;
      }
    }

    function closeJobActionsFromKeyboard(event: KeyboardEvent) {
      const menu = jobActionsMenu.current;
      if (event.key !== "Escape" || !menu?.open) return;

      event.preventDefault();
      menu.open = false;
      jobActionsTrigger.current?.focus();
    }

    document.addEventListener("pointerdown", closeJobActionsFromOutside);
    document.addEventListener("keydown", closeJobActionsFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeJobActionsFromOutside);
      document.removeEventListener("keydown", closeJobActionsFromKeyboard);
    };
  }, []);

  async function handleAssign(event: FormEvent<HTMLFormElement>, slotKey: string) {
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
      setSlotError({ slotKey, message: t("assignmentNotConfirmed") });
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

  async function handleApplicationReview(
    formData: FormData,
    applicant: JobApplicant,
    reviewAction: ApplicationReviewAction,
    action: (payload: FormData) => Promise<{ ok: boolean; formError: string | null }>,
  ) {
    setPendingReview({ action: reviewAction, cleanerId: applicant.cleanerId });
    setReviewError(null);
    try {
      const result = await action(formData);
      if (!result.ok) {
        setReviewError({
          cleanerId: applicant.cleanerId,
          message: localiseUserMessage(result.formError, locale)
            ?? result.formError
            ?? t("applicationReviewNotConfirmed"),
        });
      }
    } catch {
      setReviewError({
        cleanerId: applicant.cleanerId,
        message: t("applicationReviewNotConfirmed"),
      });
    } finally {
      router.refresh();
      setPendingReview(null);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await cancelJob(job.id);
      if (!result.ok) {
        setCancelError(localiseUserMessage(result.formError, locale) ?? result.formError);
      }
      cancelDialog.current?.close();
    } catch {
      setCancelError(t("cancellationNotConfirmed"));
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
          <div className="job-detail-title-line">
            <h1 className="page-heading">{job.site.name}</h1>
            <span className={`status-chip status-chip--${job.status}`}>
              {formatJobStatus(job.status, t)}
            </span>
          </div>
          <p className="job-detail-context">
            <span><CalendarDays aria-hidden="true" size={16} />{formatJobDate(job.scheduledStart, locale)}</span>
            <span><Clock3 aria-hidden="true" size={16} />{formatJobTime(job.scheduledStart, locale)}</span>
            <span>{job.clientName}</span>
            <span>{job.serviceName}</span>
            <span><Users aria-hidden="true" size={16} />{t("applicationsSummary", {
              openSlots: openSlots.length,
              count: awaitingApplicants.length,
            })}</span>
          </p>
        </div>
        {canCancel ? (
          <details className="job-detail-actions" ref={jobActionsMenu}>
            <summary
              aria-label={t("jobActions")}
              className="icon-button job-detail-actions__trigger"
              ref={jobActionsTrigger}
              role="button"
            >
              <Ellipsis aria-hidden="true" size={21} />
            </summary>
            <div className="job-detail-actions__panel">
              <button
                className="button button--secondary button--danger"
                onClick={() => {
                  if (jobActionsMenu.current) jobActionsMenu.current.open = false;
                  cancelDialog.current?.showModal();
                }}
                type="button"
              >
                {t("cancelJob")}
              </button>
            </div>
          </details>
        ) : null}
      </header>

      {cancelError && canCancel ? (
        <p className="job-operation-error" role="alert">{cancelError}</p>
      ) : null}

      <div className="job-staffing-layout">
        <section
          aria-labelledby="job-applications-heading"
          className="job-detail-section job-applications-section"
          id="applications"
        >
          <div className="job-detail-section__heading job-applications-heading">
            <h2 id="job-applications-heading">{t("applications")}</h2>
            <p className="tabular-numerals">
              {t("awaitingReviewCount", { count: awaitingApplicants.length })}
            </p>
          </div>

          {awaitingApplicants.length ? (
            <div aria-label={t("awaitingReview")} role="region">
              <ul aria-label={t("jobApplicants")} className="application-review-list">
                {awaitingApplicants.map((applicant, index) => {
                  const selectedSlot = selectedReviewSlot[applicant.cleanerId]
                    ?? String(openSlots[0]?.slotNumber ?? "");
                  const selectedSlotNumber = Number(selectedSlot);
                  const applicantPendingAction = pendingReview?.cleanerId === applicant.cleanerId
                    ? pendingReview.action
                    : null;
                  const reviewLocked = pendingReview !== null;
                  return (
                    <li key={applicant.cleanerId}>
                      <article aria-label={applicant.cleanerName} className="application-review-card">
                        <details name="application-review" open={index === 0}>
                          <summary>
                            <span className="application-review-avatar" aria-hidden="true">
                              {applicantInitials(applicant)}
                            </span>
                            <span className="application-review-identity">
                              <strong>{applicant.cleanerName}</strong>
                              <span>
                                <span className="application-chip application-chip--applied">
                                  {t("applicationApplied")}
                                </span>
                                {applicant.preferredRank === null ? null : (
                                  <span className="preference-label">
                                    {t("preferredRank", { rank: applicant.preferredRank })}
                                  </span>
                                )}
                                <time dateTime={applicant.appliedAt}>
                                  {t("appliedAt", {
                                    time: new Intl.DateTimeFormat(locale, {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    }).format(new Date(applicant.appliedAt)),
                                  })}
                                </time>
                              </span>
                            </span>
                          </summary>
                          <div className="application-review-actions">
                            <p>{t("approvalAssignsImmediately", {
                              cleanerName: applicant.cleanerName,
                            })}</p>
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                void handleApplicationReview(
                                  new FormData(event.currentTarget),
                                  applicant,
                                  "approve",
                                  approveJobApplication,
                                );
                              }}
                            >
                              <input name="jobId" type="hidden" value={job.id} />
                              <input name="cleanerId" type="hidden" value={applicant.cleanerId} />
                              <label htmlFor={`application-${applicant.cleanerId}-slot`}>
                                {t("crewSlotForApplicant", {
                                  cleanerName: applicant.cleanerName,
                                })}
                              </label>
                              <select
                                id={`application-${applicant.cleanerId}-slot`}
                                name="slotNumber"
                                onChange={(event) => setSelectedReviewSlot((current) => ({
                                  ...current,
                                  [applicant.cleanerId]: event.target.value,
                                }))}
                                value={selectedSlot}
                              >
                                {openSlots.map((slot) => (
                                  <option key={slot.slotNumber} value={slot.slotNumber}>
                                    {t("slotOption", { slot: slot.slotNumber })}
                                  </option>
                                ))}
                              </select>
                              <button
                                aria-label={applicantPendingAction === "approve"
                                  ? t("approvingApplicant", {
                                      cleanerName: applicant.cleanerName,
                                    })
                                  : t("approveApplicantForSlot", {
                                      cleanerName: applicant.cleanerName,
                                      slot: selectedSlotNumber,
                                    })}
                                className="button"
                                disabled={!canReview || reviewLocked}
                                type="submit"
                              >
                                {applicantPendingAction === "approve"
                                  ? t("approvingApplicant", {
                                      cleanerName: applicant.cleanerName,
                                    })
                                  : t("approveApplicantForSlot", {
                                      cleanerName: applicant.cleanerName,
                                      slot: selectedSlotNumber,
                                    })}
                              </button>
                            </form>
                            <button
                              className="button button--secondary"
                              disabled={!canReview || reviewLocked}
                              onClick={() => {
                                const formData = new FormData();
                                formData.set("jobId", job.id);
                                formData.set("cleanerId", applicant.cleanerId);
                                void handleApplicationReview(
                                  formData,
                                  applicant,
                                  "not_selected",
                                  markJobApplicationNotSelected,
                                );
                              }}
                              type="button"
                            >
                              {applicantPendingAction === "not_selected"
                                ? t("markingNotSelected", {
                                    cleanerName: applicant.cleanerName,
                                  })
                                : t("markNotSelected", {
                                    cleanerName: applicant.cleanerName,
                                  })}
                            </button>
                            {reviewError?.cleanerId === applicant.cleanerId ? (
                              <p className="job-operation-error" role="alert">
                                {reviewError.message}
                              </p>
                            ) : null}
                          </div>
                        </details>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="job-applicants-empty">{t("noAwaitingApplications")}</p>
          )}

          {resolvedApplicants.length ? (
            <div
              aria-label={t("resolvedResponses")}
              className="resolved-applications"
              role="region"
            >
              <div className="resolved-applications__heading">
                <CheckCircle2 aria-hidden="true" size={18} />
                <h3>{t("resolvedResponses")}</h3>
                <span className="tabular-numerals">{resolvedApplicants.length}</span>
              </div>
              <ul>
                {resolvedApplicants.map((applicant) => (
                  <li key={applicant.cleanerId}>
                    <div>
                      <strong>{applicant.cleanerName}</strong>
                      <span className={`application-chip application-chip--${applicant.status}`}>
                        {t(applicationLabelKeys[applicant.status])}
                      </span>
                    </div>
                    {applicant.status === "not_selected" && canReview ? (
                      <button
                        className="button button--secondary button--small"
                        disabled={pendingReview !== null}
                        onClick={() => {
                          const formData = new FormData();
                          formData.set("jobId", job.id);
                          formData.set("cleanerId", applicant.cleanerId);
                          void handleApplicationReview(
                            formData,
                            applicant,
                            "restore",
                            restoreJobApplication,
                          );
                        }}
                        type="button"
                      >
                        {pendingReview?.cleanerId === applicant.cleanerId
                          && pendingReview.action === "restore"
                          ? t("restoringApplication", {
                              cleanerName: applicant.cleanerName,
                            })
                          : t("restoreApplication", {
                              cleanerName: applicant.cleanerName,
                            })}
                      </button>
                    ) : null}
                    {reviewError?.cleanerId === applicant.cleanerId ? (
                      <p className="job-operation-error" role="alert">
                        {reviewError.message}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="job-staffing-sidebar">
          <section
            aria-labelledby="job-crew-heading"
            className="job-detail-section job-crew-section"
          >
            <div className="job-detail-section__heading">
              <h2 id="job-crew-heading">{t("crewSlots")}</h2>
              <p>{t("assignedCount", { assigned: assignedCount, total: job.crewSize })}</p>
            </div>
            <div aria-label={t("crewSlots")} className="job-slot-list" role="region">
              {job.slots.map((slot) => {
                const presentation = slotPresentation(slot, t);
                return (
                  <article
                    aria-label={t("crewSlot", { slot: slot.slotNumber })}
                    className="job-slot-row"
                    key={slotLifecycleKey(job.id, slot)}
                  >
                    <div className="job-slot-number" aria-hidden="true">{slot.slotNumber}</div>
                    <div className="job-slot-state">
                      <strong>{presentation.label}</strong>
                      <span>{presentation.detail}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section
            aria-label={t("assignDirectly")}
            className="job-detail-section direct-assignment-section"
            role="region"
          >
            <div className="job-detail-section__heading">
              <h2>{t("assignDirectly")}</h2>
              <p>{t("directAssignmentDescription")}</p>
            </div>
            {canAssign && openSlots.length && directCandidates.length ? (
              <div className="direct-assignment-list">
                {openSlots.map((slot) => {
                  const slotKey = slotLifecycleKey(job.id, slot);
                  const selectedCleanerId = selectedBySlot[slotKey] ?? "";
                  const selectedCleaner = directCandidatesById.get(selectedCleanerId);
                  return (
                    <form key={slotKey} onSubmit={(event) => handleAssign(event, slotKey)}>
                      <input name="jobId" type="hidden" value={job.id} />
                      <input name="slotNumber" type="hidden" value={slot.slotNumber} />
                      <label htmlFor={`slot-${slot.slotNumber}-cleaner`}>
                        {t("cleanerForSlot", { slot: slot.slotNumber })}
                      </label>
                      <select
                        id={`slot-${slot.slotNumber}-cleaner`}
                        name="cleanerId"
                        onChange={(event) => setSelectedBySlot((current) => ({
                          ...current,
                          [slotKey]: event.target.value,
                        }))}
                        value={selectedCleanerId}
                      >
                        <option value="">{t("chooseCleaner")}</option>
                        {directCandidates.map((candidate) => (
                          <option key={candidate.cleanerId} value={candidate.cleanerId}>
                            {candidateLabel(candidate, t)}
                          </option>
                        ))}
                      </select>
                      <button
                        aria-label={selectedCleaner
                          ? t("assignSelected", {
                              cleanerName: selectedCleaner.cleanerName,
                              slot: slot.slotNumber,
                            })
                          : t("assignSlot", { slot: slot.slotNumber })}
                        className="button button--secondary"
                        disabled={!selectedCleaner || busySlot !== null}
                        type="submit"
                      >
                        {busySlot === slotKey ? t("assigning") : t("assign")}
                      </button>
                      {slotError?.slotKey === slotKey ? (
                        <p className="job-operation-error" role="alert">{slotError.message}</p>
                      ) : null}
                    </form>
                  );
                })}
              </div>
            ) : canAssign && openSlots.length ? (
              <p className="job-slot-empty">{t("noCleanerCandidates")}</p>
            ) : null}
          </section>
        </aside>
      </div>

      <div className="job-detail-lower-grid">
        <section aria-labelledby="job-overview-heading" className="job-detail-section">
          <div className="job-detail-section__heading">
            <h2 id="job-overview-heading">{t("scheduleAndSite")}</h2>
          </div>
          <dl className="job-detail-facts">
            <div><dt>{t("detailDate")}</dt><dd><time dateTime={job.scheduledStart}>{formatJobDate(job.scheduledStart, locale)}</time></dd></div>
            <div><dt>{t("start")}</dt><dd className="tabular-numerals">{formatJobTime(job.scheduledStart, locale)}</dd></div>
            <div><dt>{t("detailDuration")}</dt><dd className="tabular-numerals">{formatJobDuration(job.durationMinutes, locale)}</dd></div>
            <div className="job-detail-fact--wide"><dt>{t("siteAddress")}</dt><dd>{job.site.address} · {job.site.suburb}</dd></div>
            <div className="job-detail-fact--wide"><dt>{t("accessNotes")}</dt><dd>{job.site.accessNotes || t("noAccessNotes")}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="job-commercial-heading" className="job-detail-section">
          <div className="job-detail-section__heading">
            <h2 id="job-commercial-heading">{t("commercialDetail")}</h2>
          </div>
          <dl className="job-commercial-facts">
            <div><dt>{t("cleanerPayPerSlotLabel")}</dt><dd className="tabular-numerals">{formatCleanerPay(job.cleanerPayCents, locale)}</dd></div>
            <div><dt>{t("clientChargeLabel")}</dt><dd className="tabular-numerals">{job.clientChargeCents === null ? t("notRecorded") : formatCleanerPay(job.clientChargeCents, locale)}</dd></div>
            <div className="job-detail-fact--wide"><dt>{t("internalNotesLabel")}</dt><dd>{job.notes || t("noInternalNotes")}</dd></div>
          </dl>
        </section>
      </div>

      <dialog
        aria-labelledby="cancel-job-title"
        className="record-dialog job-cancel-dialog"
        ref={cancelDialog}
      >
        <div className="dialog-form">
          <header className="dialog-header">
            <h2 id="cancel-job-title">{t("cancelQuestion")}</h2>
            <p>{t("cancelDescription")}</p>
          </header>
          <div className="dialog-actions">
            <button className="button button--secondary" disabled={cancelling} onClick={() => cancelDialog.current?.close()} type="button">{t("keepJob")}</button>
            <button className="button button--danger-solid" disabled={cancelling} onClick={handleCancel} type="button">{cancelling ? t("cancelling") : t("confirmCancellation")}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
