"use client";

import { CalendarDays, Clock3, MapPin, WalletCards } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState } from "react";

import { createPosting, type PostingMutationResult } from "@/app/actions/postings";
import { formatCleanerPay, formatJobDate, formatJobDuration, formatJobTime } from "@/features/jobs/format";
import type {
  OneTimePostingOption,
  PostingIntent,
  PostingWorkOption,
  RegularPostingOption,
} from "@/features/postings/types";
import type { AppLocale } from "@/i18n/config";
import { useRouter } from "@/i18n/navigation";
import { localiseFieldErrors, localiseUserMessage } from "@/i18n/user-message";

type PostingComposerProps = {
  initialIntent: PostingIntent | null;
  initialTargetId: string | null;
  jobs: OneTimePostingOption[];
  recurringAssignments: RegularPostingOption[];
};

const emptyResult: PostingMutationResult = {
  fieldErrors: {},
  formError: null,
  ok: false,
};

const weekdayMessageKeys = {
  1: "weekday1",
  2: "weekday2",
  3: "weekday3",
  4: "weekday4",
  5: "weekday5",
  6: "weekday6",
  7: "weekday7",
} as const;

function assertNever(value: never): never {
  throw new Error(`Unexpected posting option: ${JSON.stringify(value)}`);
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <span className="field-error" id={id} role="alert">{message}</span> : null;
}

export function PostingComposer({
  initialIntent,
  initialTargetId,
  jobs,
  recurringAssignments,
}: PostingComposerProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Postings");
  const router = useRouter();
  const [intent, setIntent] = useState<PostingIntent | null>(initialIntent);
  const [targetId, setTargetId] = useState(initialTargetId ?? "");
  const [description, setDescription] = useState("");
  const [expiry, setExpiry] = useState("");
  const [applicationCap, setApplicationCap] = useState("");
  const [result, setResult] = useState<PostingMutationResult>(emptyResult);
  const [busy, setBusy] = useState(false);
  const visibleFieldErrors = result.ok ? {} : result.fieldErrors;

  const selectedTarget = useMemo<PostingWorkOption | null>(() => {
    if (intent === "one_time") return jobs.find((job) => job.id === targetId) ?? null;
    if (intent === "regular") {
      return recurringAssignments.find((assignment) => assignment.id === targetId) ?? null;
    }
    return null;
  }, [intent, jobs, recurringAssignments, targetId]);

  function chooseIntent(nextIntent: PostingIntent) {
    setIntent(nextIntent);
    setTargetId("");
    setResult(emptyResult);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!intent) return;
    setBusy(true);
    setResult(emptyResult);
    try {
      const actionResult = await createPosting({
        applicationCap,
        expiresAt: expiry,
        intent,
        publicDescription: description,
        targetId: intent === "expression_of_interest" ? "" : targetId,
      });
      const nextResult: PostingMutationResult = actionResult.ok
        ? actionResult
        : {
            ...actionResult,
            fieldErrors: localiseFieldErrors(actionResult.fieldErrors, locale),
            formError: localiseUserMessage(actionResult.formError, locale) ?? null,
          };
      setResult(nextResult);
      if (nextResult.ok) {
        router.push("/cleaners");
        router.refresh();
      }
    } catch {
      setResult({ fieldErrors: {}, formError: t("createNotConfirmed"), ok: false });
    } finally {
      setBusy(false);
    }
  }

  function renderSchedule(target: PostingWorkOption) {
    switch (target.intent) {
      case "one_time":
        return `${formatJobDate(target.scheduledStart, locale)} · ${formatJobTime(target.scheduledStart, locale)}`;
      case "regular": {
        const weekday = t(weekdayMessageKeys[target.weekday]);
        return t(target.frequency === "weekly" ? "everyWeek" : "everyFortnight", {
          time: target.localStartTime.slice(0, 5),
          weekday,
        });
      }
      default:
        return assertNever(target);
    }
  }

  return (
    <form className="posting-composer" noValidate onSubmit={handleSubmit}>
      <section aria-labelledby="posting-intent-heading" className="posting-composer__section">
        <div className="posting-composer__heading">
          <p className="record-kicker">{t("stepIntent")}</p>
          <h2 id="posting-intent-heading">{t("intentTitle")}</h2>
          <p>{t("intentDescription")}</p>
        </div>
        <div className="posting-intent-options">
          {(["expression_of_interest", "one_time", "regular"] as const).map((option) => (
            <label className="posting-intent-option" key={option}>
              <input
                aria-label={t(`intent.${option}.label`)}
                checked={intent === option}
                disabled={busy}
                name="intent"
                onChange={() => chooseIntent(option)}
                type="radio"
                value={option}
              />
              <span><strong>{t(`intent.${option}.label`)}</strong>{t(`intent.${option}.help`)}</span>
            </label>
          ))}
        </div>
      </section>

      {intent === "one_time" || intent === "regular" ? (
        <section aria-labelledby="posting-record-heading" className="posting-composer__section">
          <div className="posting-composer__heading">
            <p className="record-kicker">{t("stepRecord")}</p>
            <h2 id="posting-record-heading">{t("recordTitle")}</h2>
            <p>{t("recordDescription")}</p>
          </div>
          <div className="field">
            <label htmlFor="posting-target">
              {t(intent === "one_time" ? "job" : "recurringAssignment")}
            </label>
            <select
              aria-describedby={visibleFieldErrors.targetId ? "posting-target-error" : undefined}
              aria-invalid={visibleFieldErrors.targetId ? true : undefined}
              disabled={busy}
              id="posting-target"
              onChange={(event) => setTargetId(event.target.value)}
              value={targetId}
            >
              <option value="">{t(intent === "one_time" ? "chooseJob" : "chooseRecurringAssignment")}</option>
              {(intent === "one_time" ? jobs : recurringAssignments).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.siteName} — {option.serviceName}
                </option>
              ))}
            </select>
            <FieldError id="posting-target-error" message={visibleFieldErrors.targetId} />
          </div>

          {selectedTarget ? (
            <section aria-label={t("previewTitle")} className="posting-public-preview">
              <div className="posting-public-preview__heading">
                <p className="record-kicker">{t("publicPreview")}</p>
                <h3>{selectedTarget.siteName}</h3>
              </div>
              <dl>
                <div><dt><CalendarDays aria-hidden="true" size={16} />{t("schedule")}</dt><dd>{renderSchedule(selectedTarget)}</dd></div>
                <div><dt><Clock3 aria-hidden="true" size={16} />{t("duration")}</dt><dd>{formatJobDuration(selectedTarget.durationMinutes, locale)}</dd></div>
                <div><dt>{t("service")}</dt><dd>{selectedTarget.serviceName}</dd></div>
                <div><dt><MapPin aria-hidden="true" size={16} />{t("suburb")}</dt><dd>{selectedTarget.suburb}</dd></div>
                <div><dt><WalletCards aria-hidden="true" size={16} />{t("pay")}</dt><dd>{formatCleanerPay(selectedTarget.cleanerPayCents, locale)}</dd></div>
              </dl>
              <p className="posting-public-preview__privacy">{t("privacyNote")}</p>
            </section>
          ) : null}
        </section>
      ) : null}

      {intent ? (
        <section aria-labelledby="posting-details-heading" className="posting-composer__section">
          <div className="posting-composer__heading">
            <p className="record-kicker">{t("stepDetails")}</p>
            <h2 id="posting-details-heading">{t("detailsTitle")}</h2>
          </div>
          <div className="field">
            <label htmlFor="posting-description">{t("publicDescription")}</label>
            <textarea
              aria-describedby={visibleFieldErrors.publicDescription ? "posting-description-error" : "posting-description-help"}
              aria-invalid={visibleFieldErrors.publicDescription ? true : undefined}
              disabled={busy}
              id="posting-description"
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              value={description}
            />
            <span className="field-hint" id="posting-description-help">{t("descriptionHelp")}</span>
            <FieldError id="posting-description-error" message={visibleFieldErrors.publicDescription} />
          </div>
          <div className="posting-composer__optional-grid">
            <div className="field">
              <label htmlFor="posting-expiry">{t("expiry")}</label>
              <input
                aria-describedby={visibleFieldErrors.expiresAt ? "posting-expiry-error" : "posting-expiry-help"}
                aria-invalid={visibleFieldErrors.expiresAt ? true : undefined}
                disabled={busy}
                id="posting-expiry"
                onChange={(event) => setExpiry(event.target.value)}
                type="datetime-local"
                value={expiry}
              />
              <span className="field-hint" id="posting-expiry-help">{t("expiryHelp")}</span>
              <FieldError id="posting-expiry-error" message={visibleFieldErrors.expiresAt} />
            </div>
            <div className="field">
              <label htmlFor="posting-cap">{t("applicationCap")}</label>
              <input
                aria-describedby={visibleFieldErrors.applicationCap ? "posting-cap-error" : "posting-cap-help"}
                aria-invalid={visibleFieldErrors.applicationCap ? true : undefined}
                disabled={busy}
                id="posting-cap"
                min="1"
                onChange={(event) => setApplicationCap(event.target.value)}
                type="number"
                value={applicationCap}
              />
              <span className="field-hint" id="posting-cap-help">{t("capHelp")}</span>
              <FieldError id="posting-cap-error" message={visibleFieldErrors.applicationCap} />
            </div>
          </div>
          {result.ok ? null : result.formError ? <p className="form-error" role="alert">{result.formError}</p> : null}
          <div className="posting-composer__actions">
            <button className="button button--secondary" disabled={busy} onClick={() => router.push("/cleaners")} type="button">
              {t("cancel")}
            </button>
            <button className="button" disabled={busy || !intent || ((intent === "one_time" || intent === "regular") && !targetId)} type="submit">
              {busy ? t("creating") : t("create")}
            </button>
          </div>
        </section>
      ) : null}
    </form>
  );
}
