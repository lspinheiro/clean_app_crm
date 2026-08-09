"use client";

import { CalendarClock, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

import {
  saveRecurringAssignment,
  setRecurringAssignmentActive,
  type RecurringMutationResult,
} from "@/app/actions/recurring-assignments";
import type {
  PoolCleaner,
  ServiceOption,
} from "@/features/clients/types";
import {
  formatLocalTime,
  formatNamedCoverage,
  formatRecurrence,
} from "@/features/recurring-assignments/format";
import type { RecurringAssignmentSummary } from "@/features/recurring-assignments/types";
import { formatAud, formatDuration } from "@/features/site-defaults/format";
import { reloadCurrentPage } from "@/lib/reload-page";

type SiteRecurringAssignmentsProps = {
  assignments: RecurringAssignmentSummary[];
  clientId: string;
  defaultDurationMinutes: number | null;
  defaultServiceId: string | null;
  poolCleaners: PoolCleaner[];
  services: ServiceOption[];
  siteId: string;
  siteName: string;
};

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

export function SiteRecurringAssignments({
  assignments,
  clientId,
  defaultDurationMinutes,
  defaultServiceId,
  poolCleaners,
  services,
  siteId,
  siteName,
}: SiteRecurringAssignmentsProps) {
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
      const nextResult = await saveRecurringAssignment({
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
      });
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
          "The save could not be confirmed. The page is refreshing to check the saved rule.",
      });
      reloadCurrentPage();
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(rule: RecurringAssignmentSummary) {
    setTogglingId(rule.id);
    setStatusMessage(`Saving ${formatRecurrence(rule)}…`);
    try {
      const nextResult = await setRecurringAssignmentActive({
        clientId,
        recurringAssignmentId: rule.id,
        active: !rule.active,
      });
      if (!nextResult.ok) {
        setStatusMessage(
          nextResult.formError ?? "The recurring assignment status could not be saved.",
        );
        return;
      }
      setStatusMessage(`${formatRecurrence(rule)} status saved.`);
      router.refresh();
    } catch {
      setStatusMessage(
        "The status could not be confirmed. The page is refreshing to check the saved rule.",
      );
      reloadCurrentPage();
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <section className="recurring-assignments" aria-label={`Recurring assignments for ${siteName}`}>
      <div className="recurring-heading">
        <div>
          <h3>Recurring assignments</h3>
          <p>One schedule rule per service day. Jobs are generated in the next step.</p>
        </div>
        <button
          className="button button--secondary button--small"
          onClick={() => openDialog(null)}
          type="button"
        >
          <Plus aria-hidden="true" size={16} />
          Add schedule
        </button>
      </div>

      {assignments.length ? (
        <ul className="recurring-list">
          {assignments.map((rule) => {
            const recurrence = formatRecurrence(rule);
            return (
              <li className={rule.active ? undefined : "is-inactive"} key={rule.id}>
                <span className="recurring-icon" aria-hidden="true">
                  <CalendarClock size={18} />
                </span>
                <div className="recurring-copy">
                  <strong>{recurrence}</strong>
                  <span className="tabular-numerals">
                    {formatLocalTime(rule.startTime)} · {formatDuration(rule.durationMinutes)} · {rule.service.name}
                  </span>
                  <span>
                    {formatNamedCoverage(rule)} · {formatAud(rule.cleanerPayCents)}/slot
                  </span>
                </div>
                <div className="recurring-actions">
                  <button
                    aria-checked={rule.active}
                    aria-label={`${rule.active ? "Deactivate" : "Activate"} ${recurrence}`}
                    className="status-switch"
                    disabled={togglingId !== null}
                    onClick={() => void handleToggle(rule)}
                    role="switch"
                    type="button"
                  >
                    <span aria-hidden="true" />
                    <small>{rule.active ? "Active" : "Inactive"}</small>
                  </button>
                  <button
                    aria-label={`Edit ${recurrence}`}
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
        <p className="recurring-empty">No recurring assignments for this site.</p>
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
              <p className="record-kicker">Recurring assignment</p>
              <h2 id={`recurring-dialog-title-${siteId}`}>
                {target ? `Edit ${formatRecurrence(target)}` : `Add schedule for ${siteName}`}
              </h2>
            </div>
            <button
              aria-label="Close recurring assignment"
              className="icon-button"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          </header>

          <div className="dialog-columns">
            <div className="field">
              <label htmlFor={`recurring-service-${siteId}`}>Service</label>
              <select
                defaultValue={target?.service.id ?? defaultServiceId ?? ""}
                id={`recurring-service-${siteId}`}
                name="serviceId"
              >
                <option disabled value="">Choose service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
              <FieldError id={`recurring-service-error-${siteId}`} message={result.fieldErrors.serviceId} />
            </div>
            <div className="field">
              <label htmlFor={`recurring-frequency-${siteId}`}>Frequency</label>
              <select
                defaultValue={target?.frequency ?? "weekly"}
                id={`recurring-frequency-${siteId}`}
                name="frequency"
              >
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
              </select>
            </div>
          </div>

          <div className="dialog-columns">
            <div className="field">
              <label htmlFor={`recurring-anchor-${siteId}`}>First service date</label>
              <input
                defaultValue={target?.anchorDate ?? todayInBrisbane()}
                id={`recurring-anchor-${siteId}`}
                name="anchorDate"
                type="date"
              />
              <FieldError id={`recurring-anchor-error-${siteId}`} message={result.fieldErrors.anchorDate} />
            </div>
            <div className="field">
              <label htmlFor={`recurring-time-${siteId}`}>Start time</label>
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
              <label htmlFor={`recurring-duration-${siteId}`}>Estimated hours</label>
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
              <label htmlFor={`recurring-pay-${siteId}`}>Cleaner pay per slot (AUD)</label>
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
              <label htmlFor={`recurring-crew-${siteId}`}>Crew size</label>
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
            <legend>Named cleaners (optional)</legend>
            <p>Fill named slots in order. Remaining slots become vacancies when jobs are generated.</p>
            <div className="dialog-columns">
              {selectedCleaners.map((cleanerId, index) => (
                <div className="field" key={index}>
                  <label htmlFor={`recurring-cleaner-${siteId}-${index}`}>
                    Slot {index + 1}
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
                    <option value="">Leave open</option>
                    {poolCleaners.map((cleaner) => (
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
              Cancel
            </button>
            <button className="button" disabled={busy} type="submit">
              {busy ? "Saving…" : target ? "Save changes" : "Add schedule"}
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}
