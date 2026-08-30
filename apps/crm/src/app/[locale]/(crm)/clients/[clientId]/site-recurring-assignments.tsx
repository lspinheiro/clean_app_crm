"use client";

import { CalendarClock, CheckCircle2, Clock3, Pencil, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";

import {
  saveRecurringAssignment,
  setRecurringAssignmentActive,
  type RecurringMutationResult,
} from "@/app/actions/recurring-assignments";
import type {
  CompanyCleaner,
  ServiceOption,
} from "@/features/clients/types";
import {
  formatLocalTime,
  formatNamedCoverage,
  formatRecurrence,
} from "@/features/recurring-assignments/format";
import type { RecurringAssignmentSummary } from "@/features/recurring-assignments/types";
import { formatAud, formatDuration } from "@/features/site-defaults/format";
import type { AppLocale } from "@/i18n/config";
import { Link, useRouter } from "@/i18n/navigation";
import { localiseMutationResult, localiseUserMessage } from "@/i18n/user-message";
import { reloadCurrentPage } from "@/lib/reload-page";

type SiteRecurringAssignmentsProps = {
  assignments: RecurringAssignmentSummary[];
  clientId: string;
  defaultDurationMinutes: number | null;
  defaultServiceId: string | null;
  cleaners: CompanyCleaner[];
  services: ServiceOption[];
  siteId: string;
  siteName: string;
};

const weekdayKeys = {
  1: "weekday1",
  2: "weekday2",
  3: "weekday3",
  4: "weekday4",
  5: "weekday5",
  6: "weekday6",
  7: "weekday7",
} as const;

const emptyResult: RecurringMutationResult = {
  ok: false,
  fieldErrors: {},
  formError: null,
};

function todayInBrisbane() {
  const parts = new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Australia/Brisbane",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="field-error" id={id} role="alert">
      {message}
    </span>
  ) : null;
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

export function SiteRecurringAssignments({
  assignments,
  clientId,
  defaultDurationMinutes,
  defaultServiceId,
  cleaners,
  services,
  siteId,
  siteName,
}: SiteRecurringAssignmentsProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("RecurringAssignments");
  const labels = {
    everyFortnight: (weekday: string) => t("everyFortnight", { weekday }),
    everyWeek: (weekday: string) => t("everyWeek", { weekday }),
    openSlots: (count: number) => t("openSlots", { count }),
    weekday: (day: number) => t(weekdayKeys[day as keyof typeof weekdayKeys] ?? "weekday1"),
  };
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<RecurringAssignmentSummary | null>(null);
  const [dialogVersion, setDialogVersion] = useState(0);
  const [crewSize, setCrewSize] = useState("1");
  const [selectedCleaners, setSelectedCleaners] = useState<string[]>([""]);
  const [result, setResult] = useState(emptyResult);
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  function openDialog(rule: RecurringAssignmentSummary | null) {
    setTarget(rule);
    setDialogVersion((version) => version + 1);
    setCrewSize(String(rule?.crewSize ?? 1));
    setSelectedCleaners(
      Array.from({ length: rule?.crewSize ?? 1 }, (_, index) =>
        rule?.namedCleaners.find((cleaner) => cleaner.slotNumber === index + 1)?.id ?? "",
      ),
    );
    setResult(emptyResult);
    dialog.current?.showModal();
  }

  function updateCrewSize(nextValue: string) {
    setCrewSize(nextValue);
    const numericValue = Number(nextValue);
    if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 20) return;
    const nextSize = numericValue;
    setSelectedCleaners((current) =>
      Array.from({ length: nextSize }, (_, index) => current[index] ?? ""),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setResult(emptyResult);
    try {
      const nextResult = localiseMutationResult(
        await saveRecurringAssignment({
          clientId,
          siteId,
          recurringAssignmentId: target?.id ?? "",
          serviceId: String(formData.get("serviceId") ?? ""),
          frequency: String(formData.get("frequency") ?? ""),
          anchorDate: String(formData.get("anchorDate") ?? ""),
          startTime: String(formData.get("startTime") ?? ""),
          durationHours: String(formData.get("durationHours") ?? ""),
          cleanerPayAud: String(formData.get("cleanerPayAud") ?? ""),
          crewSize: String(formData.get("crewSize") ?? ""),
          cleanerIds: selectedCleaners,
        }),
        locale,
      );
      setResult(nextResult);
      if (nextResult.ok) {
        dialog.current?.close();
        router.refresh();
      }
    } catch {
      setResult({
        ok: false,
        fieldErrors: {},
        formError:
          t("saveNotConfirmed"),
      });
      reloadCurrentPage();
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(rule: RecurringAssignmentSummary) {
    setTogglingId(rule.id);
    const recurrence = formatRecurrence(rule, labels);
    setStatusMessage(t("savingStatus", { recurrence }));
    try {
      const nextResult = await setRecurringAssignmentActive({
        clientId,
        recurringAssignmentId: rule.id,
        active: !rule.active,
      });
      if (!nextResult.ok) {
        setStatusMessage(
          localiseUserMessage(nextResult.formError, locale) ?? t("statusFailed"),
        );
        return;
      }
      setStatusMessage(t("statusSaved", { recurrence }));
      router.refresh();
    } catch {
      setStatusMessage(
        t("statusNotConfirmed"),
      );
      reloadCurrentPage();
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <section className="recurring-assignments" aria-label={t("section", { siteName })}>
      <div className="recurring-heading">
        <div>
          <h3>{t("title")}</h3>
          <p>{t("description")}</p>
        </div>
        <button
          className="button button--secondary button--small"
          onClick={() => openDialog(null)}
          type="button"
        >
          <Plus aria-hidden="true" size={16} />
          {t("addSchedule")}
        </button>
      </div>

      {assignments.length ? (
        <ul className="recurring-list">
          {assignments.map((rule) => {
            const recurrence = formatRecurrence(rule, labels);
            return (
              <li className={rule.active ? undefined : "is-inactive"} key={rule.id}>
                <span className="recurring-icon" aria-hidden="true">
                  <CalendarClock size={18} />
                </span>
                <div className="recurring-copy">
                  <strong>{recurrence}</strong>
                  <span className="tabular-numerals">
                    {formatLocalTime(rule.startTime)} · {formatDuration(rule.durationMinutes, locale)} · {rule.service.name}
                  </span>
                  <span>
                    {formatNamedCoverage(rule, labels)} · {formatAud(rule.cleanerPayCents, locale)}{t("perSlot")}
                  </span>
                  {rule.namedCleaners.length ? (
                    <div
                      aria-label={t("namedOfferStates")}
                      className="recurring-cleaner-consent-list"
                      role="list"
                    >
                      {rule.namedCleaners.map((cleaner) => (
                        <div
                          className="recurring-cleaner-consent"
                          key={cleaner.id}
                          role="listitem"
                        >
                          <strong>{cleaner.name}</strong>
                          <span
                            className={`series-consent-chip series-consent-chip--${cleaner.consentState.status}`}
                          >
                            {cleaner.consentState.status === "offered" ? (
                              <Clock3 aria-hidden="true" size={13} />
                            ) : (
                              <CheckCircle2 aria-hidden="true" size={13} />
                            )}
                            {t(cleaner.consentState.status)}
                          </span>
                          {cleaner.consentState.status === "offered"
                            && cleaner.consentState.createdAt ? (
                            <time dateTime={cleaner.consentState.createdAt}>
                              {formatOfferAge(cleaner.consentState.createdAt, t)}
                            </time>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="recurring-actions">
                  {rule.active && rule.namedCleaners.length < rule.crewSize ? (
                    <Link
                      aria-label={t("postPublicly", { recurrence })}
                      className="button button--secondary button--small"
                      href={`/cleaners/postings/new?intent=regular&recurringAssignmentId=${rule.id}`}
                    >
                      {t("postPublicly", { recurrence })}
                    </Link>
                  ) : null}
                  <button
                    aria-checked={rule.active}
                    aria-label={t(rule.active ? "deactivate" : "activate", { recurrence })}
                    className="status-switch"
                    disabled={togglingId !== null}
                    onClick={() => void handleToggle(rule)}
                    role="switch"
                    type="button"
                  >
                    <span aria-hidden="true" />
                    <small>{rule.active ? t("active") : t("inactive")}</small>
                  </button>
                  <button
                    aria-label={t("edit", { recurrence })}
                    className="icon-button"
                    onClick={() => openDialog(rule)}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={17} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="recurring-empty">{t("none")}</p>
      )}
      <p className="recurring-status" role="status" aria-live="polite">
        {statusMessage}
      </p>

      <dialog
        aria-labelledby={`recurring-dialog-title-${siteId}`}
        className="record-dialog recurring-dialog"
        ref={dialog}
      >
        <form
          className="dialog-form"
          key={`${target?.id ?? "new-recurring-assignment"}-${dialogVersion}`}
          noValidate
          onSubmit={handleSubmit}
        >
          <header className="dialog-header">
            <div>
              <p className="record-kicker">{t("record")}</p>
              <h2 id={`recurring-dialog-title-${siteId}`}>
                {target
                  ? t("edit", { recurrence: formatRecurrence(target, labels) })
                  : t("addForSite", { siteName })}
              </h2>
            </div>
            <button
              aria-label={t("close")}
              className="icon-button"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          </header>

          <div className="dialog-columns">
            <div className="field">
              <label htmlFor={`recurring-service-${siteId}`}>{t("service")}</label>
              <select
                defaultValue={target?.service.id ?? defaultServiceId ?? ""}
                id={`recurring-service-${siteId}`}
                name="serviceId"
              >
                <option disabled value="">{t("chooseService")}</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
              <FieldError id={`recurring-service-error-${siteId}`} message={result.fieldErrors.serviceId} />
            </div>
            <div className="field">
              <label htmlFor={`recurring-frequency-${siteId}`}>{t("frequency")}</label>
              <select
                defaultValue={target?.frequency ?? "weekly"}
                id={`recurring-frequency-${siteId}`}
                name="frequency"
              >
                <option value="weekly">{t("weekly")}</option>
                <option value="fortnightly">{t("fortnightly")}</option>
              </select>
            </div>
          </div>

          <div className="dialog-columns">
            <div className="field">
              <label htmlFor={`recurring-anchor-${siteId}`}>{t("firstDate")}</label>
              <input
                defaultValue={target?.anchorDate ?? todayInBrisbane()}
                id={`recurring-anchor-${siteId}`}
                name="anchorDate"
                type="date"
              />
              <FieldError id={`recurring-anchor-error-${siteId}`} message={result.fieldErrors.anchorDate} />
            </div>
            <div className="field">
              <label htmlFor={`recurring-time-${siteId}`}>{t("startTime")}</label>
              <input
                defaultValue={target ? formatLocalTime(target.startTime) : "08:00"}
                id={`recurring-time-${siteId}`}
                name="startTime"
                type="time"
              />
              <FieldError id={`recurring-time-error-${siteId}`} message={result.fieldErrors.startTime} />
            </div>
          </div>

          <div className="recurring-form-grid">
            <div className="field">
              <label htmlFor={`recurring-duration-${siteId}`}>{t("estimatedHours")}</label>
              <input
                defaultValue={target
                  ? target.durationMinutes / 60
                  : defaultDurationMinutes
                    ? defaultDurationMinutes / 60
                    : ""}
                id={`recurring-duration-${siteId}`}
                min="0.25"
                name="durationHours"
                step="0.25"
                type="number"
              />
              <FieldError id={`recurring-duration-error-${siteId}`} message={result.fieldErrors.durationHours} />
            </div>
            <div className="field">
              <label htmlFor={`recurring-pay-${siteId}`}>{t("cleanerPay")}</label>
              <input
                defaultValue={target ? (target.cleanerPayCents / 100).toFixed(2) : ""}
                id={`recurring-pay-${siteId}`}
                inputMode="decimal"
                min="0.01"
                name="cleanerPayAud"
                step="0.01"
                type="number"
              />
              <FieldError id={`recurring-pay-error-${siteId}`} message={result.fieldErrors.cleanerPayAud} />
            </div>
            <div className="field">
              <label htmlFor={`recurring-crew-${siteId}`}>{t("crewSize")}</label>
              <input
                id={`recurring-crew-${siteId}`}
                max="20"
                min="1"
                name="crewSize"
                onChange={(event) => updateCrewSize(event.target.value)}
                type="number"
                value={crewSize}
              />
              <FieldError id={`recurring-crew-error-${siteId}`} message={result.fieldErrors.crewSize} />
            </div>
          </div>

          <fieldset className="named-cleaner-fields">
            <legend>{t("namedCleaners")}</legend>
            <p>{t("namedDescription")}</p>
            <div className="dialog-columns">
              {selectedCleaners.map((cleanerId, index) => (
                <div className="field" key={index}>
                  <label htmlFor={`recurring-cleaner-${siteId}-${index}`}>
                    {t("slot", { slot: index + 1 })}
                  </label>
                  <select
                    id={`recurring-cleaner-${siteId}-${index}`}
                    name="cleanerIds"
                    disabled={
                      index > 0 && selectedCleaners.slice(0, index).some((selected) => !selected)
                    }
                    onChange={(event) =>
                      setSelectedCleaners((current) =>
                        current.map((value, currentIndex) =>
                          currentIndex === index
                            ? event.target.value
                            : currentIndex > index && !event.target.value
                              ? ""
                              : value,
                        ),
                      )
                    }
                    value={cleanerId}
                  >
                    <option value="">{t("leaveOpen")}</option>
                    {cleaners.map((cleaner) => (
                      <option
                        disabled={selectedCleaners.some(
                          (selected, selectedIndex) =>
                            selectedIndex !== index && selected === cleaner.id,
                        )}
                        key={cleaner.id}
                        value={cleaner.id}
                      >
                        {cleaner.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <FieldError id={`recurring-cleaners-error-${siteId}`} message={result.fieldErrors.cleanerIds} />
          </fieldset>

          {result.formError ? <p className="form-error" role="alert">{result.formError}</p> : null}
          <footer className="dialog-actions">
            <button
              className="button button--secondary"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              {t("cancel")}
            </button>
            <button className="button" disabled={busy} type="submit">
              {busy ? t("saving") : target ? t("saveChanges") : t("addSchedule")}
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}
