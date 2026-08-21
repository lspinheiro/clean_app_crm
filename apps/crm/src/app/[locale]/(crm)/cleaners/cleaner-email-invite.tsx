"use client";

import { CheckCircle2, Download, Mail, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ChangeEvent, useMemo, useState } from "react";
import { z } from "zod";

import {
  retryFailedCleanerInviteEmails,
  sendCleanerInviteEmails,
  type CleanerInviteEmailActionResult,
} from "@/app/actions/cleaner-email";
import {
  CLEANER_INVITE_EMAIL_RECIPIENT_LIMIT,
  parseCleanerInviteEmailCsv,
  type CleanerInviteEmailCsvMessageKey,
  type CleanerInviteEmailCsvPreview,
} from "@/features/cleaners/email-csv";
import { buildCleanerInviteEmail } from "@/features/cleaners/email";
import type { AppLocale } from "@/i18n/config";
import { localiseUserMessage } from "@/i18n/user-message";

type CleanerEmailInviteProps = {
  companyName: string;
  inviteId: string | null;
  joinUrl: string | null;
};

type ManualRecipientInput = {
  email: string;
  id: number;
};

type ManualRecipientIssue = "duplicate" | "invalid" | null;

const manualEmailSchema = z.email().max(320);

function emptyPreview(): CleanerInviteEmailCsvPreview {
  return { fileError: null, recipients: [], rows: [] };
}

export function CleanerEmailInvite({
  companyName,
  inviteId,
  joinUrl,
}: CleanerEmailInviteProps) {
  const currentLocale = useLocale() as AppLocale;
  const t = useTranslations("Cleaners");
  const [expanded, setExpanded] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState<AppLocale>(currentLocale);
  const [manualRecipients, setManualRecipients] = useState<ManualRecipientInput[]>([
    { email: "", id: 1 },
  ]);
  const [preview, setPreview] = useState<CleanerInviteEmailCsvPreview>(emptyPreview);
  const [fileName, setFileName] = useState("");
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Extract<CleanerInviteEmailActionResult, { ok: true }> | null>(null);
  const [error, setError] = useState("");

  const emailPreview = useMemo(
    () => joinUrl
      ? buildCleanerInviteEmail({ companyName, joinUrl, locale: selectedLocale })
      : null,
    [companyName, joinUrl, selectedLocale],
  );
  const manualRecipientRows = useMemo(() => {
    const seen = new Set(
      preview.recipients.map((recipient) => recipient.email.toLocaleLowerCase("en-AU")),
    );
    return manualRecipients.map((recipient) => {
      const email = recipient.email.trim().toLocaleLowerCase("en-AU");
      let issue: ManualRecipientIssue = null;
      if (email && !manualEmailSchema.safeParse(email).success) issue = "invalid";
      else if (email && seen.has(email)) issue = "duplicate";
      else if (email) seen.add(email);
      return {
        ...recipient,
        issue,
        normalisedEmail: email && !issue ? email : null,
      };
    });
  }, [manualRecipients, preview.recipients]);
  const recipients = useMemo(
    () => [
      ...preview.recipients,
      ...manualRecipientRows.flatMap((recipient) =>
        recipient.normalisedEmail
          ? [{ email: recipient.normalisedEmail, name: null }]
          : []),
    ],
    [manualRecipientRows, preview.recipients],
  );
  const csvInvalidCount = preview.rows.filter((row) => row.status === "invalid").length;
  const duplicateCount = preview.rows.filter((row) => row.status === "duplicate").length;
  const hasManualIssues = manualRecipientRows.some((recipient) => recipient.issue !== null);
  const exceedsRecipientLimit = recipients.length > CLEANER_INVITE_EMAIL_RECIPIENT_LIMIT;
  const canSend = Boolean(
    inviteId
    && joinUrl
    && authorityConfirmed
    && recipients.length
    && csvInvalidCount === 0
    && !hasManualIssues
    && !exceedsRecipientLimit
    && !submitting,
  );

  function csvMessage(key: CleanerInviteEmailCsvMessageKey) {
    return t(`emailCsv.${key}`);
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setResult(null);
    setError("");
    setAuthorityConfirmed(false);
    if (!file) {
      setFileName("");
      setPreview(emptyPreview());
      return;
    }

    setFileName(file.name);
    try {
      const source = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      setPreview(parseCleanerInviteEmailCsv(source, csvMessage));
    } catch {
      setPreview({
        fileError: t("emailFileReadFailed"),
        recipients: [],
        rows: [],
      });
    }
  }

  function updateManualRecipient(id: number, email: string) {
    setManualRecipients((recipients) => recipients.map((recipient) =>
      recipient.id === id ? { ...recipient, email } : recipient));
    setAuthorityConfirmed(false);
    setResult(null);
    setError("");
  }

  function addManualRecipient() {
    setManualRecipients((recipients) => [
      ...recipients,
      {
        email: "",
        id: Math.max(...recipients.map((recipient) => recipient.id), 0) + 1,
      },
    ]);
    setAuthorityConfirmed(false);
    setResult(null);
    setError("");
  }

  function removeManualRecipient(id: number) {
    setManualRecipients((recipients) => recipients.length === 1
      ? [{ email: "", id: recipients[0]?.id ?? 1 }]
      : recipients.filter((recipient) => recipient.id !== id));
    setAuthorityConfirmed(false);
    setResult(null);
    setError("");
  }

  function showActionError(actionResult: Extract<CleanerInviteEmailActionResult, { ok: false }>) {
    setError(localiseUserMessage(actionResult.error, currentLocale) ?? t("emailSendFailed"));
  }

  async function sendInvitations() {
    if (!canSend || !inviteId) return;
    setSubmitting(true);
    setError("");
    try {
      const actionResult = await sendCleanerInviteEmails({
        authorityConfirmed,
        inviteId,
        locale: selectedLocale,
        recipients,
      });
      if (actionResult.ok) setResult(actionResult);
      else showActionError(actionResult);
    } catch {
      setError(t("emailSendFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function retryFailed() {
    if (!result?.failed.length || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const actionResult = await retryFailedCleanerInviteEmails({
        batchId: result.batchId,
        retryKey: crypto.randomUUID(),
      });
      if (actionResult.ok) setResult(actionResult);
      else showActionError(actionResult);
    } catch {
      setError(t("emailSendFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label={t("emailSectionTitle")} className="cleaners-email-invite">
      <div className="cleaners-email-invite__entry">
        <div>
          <strong>{t("emailSectionTitle")}</strong>
          <p>{t("emailDescription")}</p>
        </div>
        <button
          aria-expanded={expanded}
          className="button button--secondary"
          disabled={!inviteId || !joinUrl}
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <Mail aria-hidden="true" size={17} />
          {t("emailInviteAction")}
        </button>
      </div>

      {expanded ? (
        <form
          aria-label={t("emailRecipientsForm")}
          className="cleaners-email-invite__flow"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void sendInvitations();
          }}
        >
          <div className="cleaners-email-invite__controls">
            <div>
              <p className="field-label">{t("emailRecipientsForm")}</p>
              <p className="field-hint">{t("emailManualDescription")}</p>
            </div>
            {manualRecipientRows.map((recipient, index) => {
              const errorId = `cleaners-email-manual-${recipient.id}-error`;
              const inputId = `cleaners-email-manual-${recipient.id}`;
              const issue = recipient.issue === "invalid"
                ? t("emailCsv.validEmail")
                : recipient.issue === "duplicate"
                  ? t("emailManualDuplicate")
                  : null;
              return (
                <div className="field" key={recipient.id}>
                  <label htmlFor={inputId}>
                    {t("emailManualAddress", { index: index + 1 })}
                  </label>
                  <div className="cleaners-email-invite__file-row">
                    <input
                      aria-describedby={issue ? errorId : undefined}
                      aria-invalid={Boolean(issue)}
                      autoComplete="email"
                      className="form-control"
                      disabled={submitting}
                      id={inputId}
                      maxLength={320}
                      onChange={(event) => updateManualRecipient(recipient.id, event.target.value)}
                      type="email"
                      value={recipient.email}
                    />
                    {manualRecipients.length > 1 ? (
                      <button
                        aria-label={t("emailRemoveAddress", { index: index + 1 })}
                        className="button button--secondary"
                        disabled={submitting}
                        onClick={() => removeManualRecipient(recipient.id)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={16} />
                        {t("emailRemoveAddress", { index: index + 1 })}
                      </button>
                    ) : null}
                  </div>
                  {issue ? (
                    <span className="field-error" id={errorId}>
                      {issue}
                    </span>
                  ) : null}
                </div>
              );
            })}
            <button
              className="button button--secondary"
              disabled={
                submitting
                || manualRecipients.length + preview.recipients.length
                  >= CLEANER_INVITE_EMAIL_RECIPIENT_LIMIT
              }
              onClick={addManualRecipient}
              type="button"
            >
              <Plus aria-hidden="true" size={17} />
              {t("emailAddAddress")}
            </button>

            <p className="field-hint">{t("emailCsvAlternative")}</p>
            <label className="field-label" htmlFor="cleaners-email-csv">
              {t("emailCsvFile")}
            </label>
            <div className="cleaners-email-invite__file-row">
              <label className="button button--secondary" htmlFor="cleaners-email-csv">
                <Upload aria-hidden="true" size={17} />
                {t("emailChooseCsv")}
              </label>
              <input
                accept=".csv,text/csv"
                className="visually-hidden"
                disabled={submitting}
                id="cleaners-email-csv"
                onChange={(event) => void chooseFile(event)}
                type="file"
              />
              <span>{fileName || t("emailNoFile")}</span>
              <a
                className="text-link"
                download
                href="/templates/cleaner-invites.csv"
              >
                <Download aria-hidden="true" size={15} />
                {t("emailDownloadTemplate")}
              </a>
            </div>

            <label className="field-label" htmlFor="cleaners-email-locale">
              {t("emailLocale")}
            </label>
            <select
              className="form-control"
              disabled={submitting}
              id="cleaners-email-locale"
              onChange={(event) => setSelectedLocale(event.target.value as AppLocale)}
              value={selectedLocale}
            >
              <option value="en-AU">{t("emailLocaleEnglish")}</option>
              <option value="pt-BR">{t("emailLocalePortuguese")}</option>
            </select>
          </div>

          {preview.fileError ? (
            <p className="cleaners-email-invite__error" role="alert">{preview.fileError}</p>
          ) : null}

          {exceedsRecipientLimit ? (
            <p className="cleaners-email-invite__error" role="alert">
              {t("emailRecipientLimit")}
            </p>
          ) : null}

          {recipients.length || preview.rows.length ? (
            <div className="cleaners-email-invite__counts" aria-live="polite">
              <strong>{t("emailRecipientCount", { count: recipients.length })}</strong>
                {duplicateCount ? <span>{t("emailDuplicateCount", { count: duplicateCount })}</span> : null}
              {csvInvalidCount ? <span>{t("emailInvalidCount", { count: csvInvalidCount })}</span> : null}
            </div>
          ) : null}

          {preview.rows.length ? (
              <div className="cleaners-email-invite__table-scroll">
                <table aria-label={t("emailCsvPreview")} className="cleaners-email-invite__table">
                  <thead>
                    <tr>
                      <th scope="col">{t("emailRow")}</th>
                      <th scope="col">{t("emailAddress")}</th>
                      <th scope="col">{t("emailName")}</th>
                      <th scope="col">{t("emailStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.email || t("emailMissing")}</td>
                        <td>{row.name ?? "—"}</td>
                        <td>{row.reason ?? t("emailReady")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          ) : null}

          {recipients.length && emailPreview ? (
            <section aria-label={t("emailMessagePreview")} className="cleaners-email-invite__message">
              <h3>{t("emailMessagePreview")}</h3>
              <dl>
                <div><dt>{t("emailSubject")}</dt><dd>{emailPreview.subject}</dd></div>
                <div><dt>{t("emailBody")}</dt><dd><pre>{emailPreview.text}</pre></dd></div>
              </dl>
            </section>
          ) : null}

          {recipients.length ? (
            <label className="cleaners-email-invite__authority">
              <input
                checked={authorityConfirmed}
                disabled={submitting}
                onChange={(event) => setAuthorityConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>{t("emailAuthority")}</span>
            </label>
          ) : null}

          <button className="button" disabled={!canSend} type="submit">
            {submitting ? <RefreshCw aria-hidden="true" className="button-spinner" size={17} /> : <Mail aria-hidden="true" size={17} />}
            {submitting
              ? t("emailSending")
              : recipients.length
                ? t("emailSendCount", { count: recipients.length })
                : t("emailSend")}
          </button>

          {error ? <p className="cleaners-email-invite__error" role="alert">{error}</p> : null}

          {result ? (
            <section aria-label={t("emailResults")} className="cleaners-email-invite__results">
              <div>
                <CheckCircle2 aria-hidden="true" size={19} />
                <strong>{t("emailAcceptedCount", { count: result.accepted.length })}</strong>
                <span>{t("emailFailedCount", { count: result.failed.length })}</span>
              </div>
              {result.failed.length ? (
                <>
                  <ul>
                    {result.failed.map((recipient) => (
                      <li key={recipient.email}>{recipient.email}</li>
                    ))}
                  </ul>
                  <button
                    className="button button--secondary"
                    disabled={submitting}
                    onClick={() => void retryFailed()}
                    type="button"
                  >
                    <RefreshCw aria-hidden="true" className={submitting ? "button-spinner" : undefined} size={17} />
                    {submitting ? t("emailRetrying") : t("emailRetryFailed")}
                  </button>
                </>
              ) : null}
            </section>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
