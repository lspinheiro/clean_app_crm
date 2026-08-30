"use client";

import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Ellipsis, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  approveJobApplication,
  cancelJob,
  markJobApplicationNotSelected,
  restoreJobApplication,
} from "@/app/actions/jobs";
import { offerJob, revokeJobOffer } from "@/app/actions/offers";
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
  JobPendingOffer,
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

type OfferAgeTranslator = (
  key: "offerAgeNow" | "offerAgeMinutes" | "offerAgeHours" | "offerAgeDays",
  values?: { count: number },
) => string;

function formatOfferAge(createdAt: string, t: OfferAgeTranslator) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000),
  );
  if (elapsedMinutes < 1) return t("offerAgeNow");
  if (elapsedMinutes < 60) return t("offerAgeMinutes", { count: elapsedMinutes });
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return t("offerAgeHours", { count: elapsedHours });
  return t("offerAgeDays", { count: Math.floor(elapsedHours / 24) });
}

export function JobDetailWorkspace({ job }: { job: JobDetail }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Jobs");
  const router = useRouter();
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const jobActionsMenu = useRef<HTMLDetailsElement>(null);
  const jobActionsTrigger = useRef<HTMLElement>(null);
  const offerLifecycleKey = [
    job.id,
    job.status,
    job.slots.map((slot) => slotLifecycleKey(job.id, slot)).join("|"),
    job.pendingOffers.map((offer) => offer.id).join("|"),
  ].join(":");
  const [selectedOffer, setSelectedOffer] = useState({
    cleanerId: "",
    lifecycleKey: offerLifecycleKey,
  });
  const selectedOfferCleanerId = selectedOffer.lifecycleKey === offerLifecycleKey
    ? selectedOffer.cleanerId
    : "";
  const [selectedReviewSlot, setSelectedReviewSlot] = useState<Record<string, string>>({});
  const [sendingOffer, setSendingOffer] = useState(false);
  const [revokingOfferId, setRevokingOfferId] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<{
    lifecycleKey: string;
    message: string;
  } | null>(null);
  const visibleOfferError = offerError?.lifecycleKey === offerLifecycleKey
    ? offerError.message
    : null;
  const [pendingReview, setPendingReview] = useState<{
    action: ApplicationReviewAction;
    cleanerId: string;
  } | null>(null);
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
  const offerCandidates = useMemo(() => {
    const excludedCleanerIds = new Set([
      ...job.applicants.map((applicant) => applicant.cleanerId),
      ...job.pendingOffers.map((offer) => offer.cleanerId),
      ...job.slots.flatMap((slot) => (
        slot.state === "assigned" ? [slot.assignment.cleanerId] : []
      )),
    ]);
    return job.cleanerCandidates.filter(
      (candidate) => !excludedCleanerIds.has(candidate.cleanerId),
    );
  }, [job.applicants, job.cleanerCandidates, job.pendingOffers, job.slots]);
  const offerCandidatesById = new Map(
    offerCandidates.map((candidate) => [candidate.cleanerId, candidate]),
  );
  const canAssign = job.status === "draft" || job.status === "posted";
  const canOffer = canAssign && job.pendingOffers.length < openSlots.length;
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

  async function handleOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSendingOffer(true);
    setOfferError(null);
    try {
      const result = await offerJob(formData);
      if (!result.ok) {
        setOfferError({
          lifecycleKey: offerLifecycleKey,
          message: localiseUserMessage(result.formError, locale) ?? result.formError,
        });
      }
    } catch {
      setOfferError({
        lifecycleKey: offerLifecycleKey,
        message: t("offerNotConfirmed"),
      });
    } finally {
      router.refresh();
      setSelectedOffer({ cleanerId: "", lifecycleKey: offerLifecycleKey });
      setSendingOffer(false);
    }
  }

  async function handleRevokeOffer(offer: JobPendingOffer) {
    setRevokingOfferId(offer.id);
    setOfferError(null);
    try {
      const result = await revokeJobOffer(job.id, offer.id);
      if (!result.ok) {
        setOfferError({
          lifecycleKey: offerLifecycleKey,
          message: localiseUserMessage(result.formError, locale) ?? result.formError,
        });
      }
    } catch {
      setOfferError({
        lifecycleKey: offerLifecycleKey,
        message: t("offerNotConfirmed"),
      });
    } finally {
      router.refresh();
      setRevokingOfferId(null);
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
        <div className="job-detail-header__actions">
        {canAssign && openSlots.length > 0 ? (
          <Link
            className="button button--secondary"
            href={`/cleaners/postings/new?intent=one_time&jobId=${job.id}`}
          >
            {t("postPublicly")}
          </Link>
        ) : null}
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
        </div>
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
                  const storedSlot = selectedReviewSlot[applicant.cleanerId];
                  const selectedSlot = storedSlot
                    && openSlots.some((slot) => String(slot.slotNumber) === storedSlot)
                    ? storedSlot
                    : String(openSlots[0]?.slotNumber ?? "");
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
            aria-label={t("directedOffers")}
            className="job-detail-section directed-offers-section"
            role="region"
          >
            <div className="job-detail-section__heading">
              <h2>{t("directedOffers")}</h2>
              <p>{t("directedOffersDescription")}</p>
            </div>
            {job.pendingOffers.length ? (
              <div aria-label={t("pendingOffers")} className="pending-offers" role="region">
                <h3>{t("pendingOffers")}</h3>
                <ul>
                  {job.pendingOffers.map((offer) => (
                    <li key={offer.id}>
                      <div>
                        <strong>{offer.cleanerName}</strong>
                        <span className="application-chip application-chip--pending">
                          <Clock3 aria-hidden="true" size={13} />
                          {t("offerPending")}
                        </span>
                        <time dateTime={offer.createdAt}>
                          {formatOfferAge(offer.createdAt, t)}
                        </time>
                      </div>
                      <button
                        aria-label={t("revokeOfferTo", { cleanerName: offer.cleanerName })}
                        className="button button--secondary button--small"
                        disabled={sendingOffer || revokingOfferId !== null}
                        onClick={() => void handleRevokeOffer(offer)}
                        type="button"
                      >
                        {revokingOfferId === offer.id
                          ? t("revokingOffer")
                          : t("revokeOffer")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {canOffer && offerCandidates.length ? (
              <form className="directed-offer-form" onSubmit={handleOffer}>
                <input name="jobId" type="hidden" value={job.id} />
                <label htmlFor="job-offer-cleaner">{t("cleanerToOffer")}</label>
                <select
                  id="job-offer-cleaner"
                  name="cleanerId"
                  onChange={(event) => setSelectedOffer({
                    cleanerId: event.target.value,
                    lifecycleKey: offerLifecycleKey,
                  })}
                  value={selectedOfferCleanerId}
                >
                  <option value="">{t("chooseOfferCleaner")}</option>
                  {offerCandidates.map((candidate) => (
                    <option key={candidate.cleanerId} value={candidate.cleanerId}>
                      {candidateLabel(candidate, t)}
                    </option>
                  ))}
                </select>
                <button
                  aria-label={selectedOfferCleanerId
                    ? t("sendOfferTo", {
                        cleanerName: offerCandidatesById.get(selectedOfferCleanerId)?.cleanerName
                          ?? "",
                      })
                    : t("sendOffer")}
                  className="button"
                  disabled={!selectedOfferCleanerId || sendingOffer || revokingOfferId !== null}
                  type="submit"
                >
                  {sendingOffer ? t("sendingOffer") : t("sendOffer")}
                </button>
              </form>
            ) : canAssign && openSlots.length ? (
              <p className="job-slot-empty">
                {canOffer ? t("noOfferCandidates") : t("offerCapacityHeld")}
              </p>
            ) : null}
            {visibleOfferError ? (
              <p className="job-operation-error" role="alert">{visibleOfferError}</p>
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
