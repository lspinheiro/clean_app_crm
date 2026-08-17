"use client";

import { CheckCircle2, Download, Mail, RefreshCw, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ChangeEvent, useMemo, useState } from "react";

import {
  retryFailedPoolInviteEmails,
  sendPoolInviteEmails,
  type PoolInviteEmailActionResult,
} from "@/app/actions/pool-email";
import {
  parsePoolInviteEmailCsv,
  type PoolInviteEmailCsvMessageKey,
  type PoolInviteEmailCsvPreview,
} from "@/features/pool/email-csv";
import { buildPoolInviteEmail } from "@/features/pool/email";
import type { AppLocale } from "@/i18n/config";
import { localiseUserMessage } from "@/i18n/user-message";

type PoolEmailInviteProps = {
  companyName: string;
  inviteId: string | null;
  joinUrl: string | null;
};

function emptyPreview(): PoolInviteEmailCsvPreview {
  return { fileError: null, recipients: [], rows: [] };
}

export function PoolEmailInvite({
  companyName,
  inviteId,
  joinUrl,
}: PoolEmailInviteProps) {
  const currentLocale = useLocale() as AppLocale;
  const t = useTranslations("Pool");
  const [expanded, setExpanded] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState<AppLocale>(currentLocale);
  const [preview, setPreview] = useState<PoolInviteEmailCsvPreview>(emptyPreview);
  const [fileName, setFileName] = useState("");
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Extract<PoolInviteEmailActionResult, { ok: true }> | null>(null);
  const [error, setError] = useState("");

  const emailPreview = useMemo(
    () => joinUrl
      ? buildPoolInviteEmail({ companyName, joinUrl, locale: selectedLocale })
      : null,
    [companyName, joinUrl, selectedLocale],
  );
  const invalidCount = preview.rows.filter((row) => row.status === "invalid").length;
  const duplicateCount = preview.rows.filter((row) => row.status === "duplicate").length;
  const canSend = Boolean(
    inviteId
    && joinUrl
    && authorityConfirmed
    && preview.recipients.length
    && invalidCount === 0
    && !submitting,
  );

  function csvMessage(key: PoolInviteEmailCsvMessageKey) {
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
      setPreview(parsePoolInviteEmailCsv(source, csvMessage));
    } catch {
      setPreview({
        fileError: t("emailFileReadFailed"),
        recipients: [],
        rows: [],
      });
    }
  }

  function showActionError(actionResult: Extract<PoolInviteEmailActionResult, { ok: false }>) {
    setError(localiseUserMessage(actionResult.error, currentLocale) ?? t("emailSendFailed"));
  }

  async function sendInvitations() {
    if (!canSend || !inviteId) return;
    setSubmitting(true);
    setError("");
    try {
      const actionResult = await sendPoolInviteEmails({
        authorityConfirmed,
        inviteId,
        locale: selectedLocale,
        recipients: preview.recipients,
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
      const actionResult = await retryFailedPoolInviteEmails({
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
    <section aria-label={t("emailSectionTitle")} className="pool-email-invite">
      <div className="pool-email-invite__entry">
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
        <div className="pool-email-invite__flow">
          <div className="pool-email-invite__controls">
            <label className="field-label" htmlFor="pool-email-csv">
              {t("emailCsvFile")}
            </label>
            <div className="pool-email-invite__file-row">
              <label className="button button--secondary" htmlFor="pool-email-csv">
                <Upload aria-hidden="true" size={17} />
                {t("emailChooseCsv")}
              </label>
              <input
                accept=".csv,text/csv"
                className="visually-hidden"
                disabled={submitting}
                id="pool-email-csv"
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

            <label className="field-label" htmlFor="pool-email-locale">
              {t("emailLocale")}
            </label>
            <select
              className="form-control"
              disabled={submitting}
              id="pool-email-locale"
              onChange={(event) => setSelectedLocale(event.target.value as AppLocale)}
              value={selectedLocale}
            >
              <option value="en-AU">{t("emailLocaleEnglish")}</option>
              <option value="pt-BR">{t("emailLocalePortuguese")}</option>
            </select>
          </div>

          {preview.fileError ? (
            <p className="pool-email-invite__error" role="alert">{preview.fileError}</p>
          ) : null}

          {preview.rows.length ? (
            <>
              <div className="pool-email-invite__counts" aria-live="polite">
                <strong>{t("emailRecipientCount", { count: preview.recipients.length })}</strong>
                {duplicateCount ? <span>{t("emailDuplicateCount", { count: duplicateCount })}</span> : null}
                {invalidCount ? <span>{t("emailInvalidCount", { count: invalidCount })}</span> : null}
              </div>
              <div className="pool-email-invite__table-scroll">
                <table aria-label={t("emailCsvPreview")} className="pool-email-invite__table">
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
            </>
          ) : null}

          {preview.recipients.length && emailPreview ? (
            <section aria-label={t("emailMessagePreview")} className="pool-email-invite__message">
              <h3>{t("emailMessagePreview")}</h3>
              <dl>
                <div><dt>{t("emailSubject")}</dt><dd>{emailPreview.subject}</dd></div>
                <div><dt>{t("emailBody")}</dt><dd><pre>{emailPreview.text}</pre></dd></div>
              </dl>
            </section>
          ) : null}

          {preview.recipients.length ? (
            <label className="pool-email-invite__authority">
              <input
                checked={authorityConfirmed}
                disabled={submitting}
                onChange={(event) => setAuthorityConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>{t("emailAuthority")}</span>
            </label>
          ) : null}

          {preview.recipients.length ? (
            <button
              className="button"
              disabled={!canSend}
              onClick={() => void sendInvitations()}
              type="button"
            >
              {submitting ? <RefreshCw aria-hidden="true" className="button-spinner" size={17} /> : <Mail aria-hidden="true" size={17} />}
              {submitting
                ? t("emailSending")
                : t("emailSendCount", { count: preview.recipients.length })}
            </button>
          ) : null}

          {error ? <p className="pool-email-invite__error" role="alert">{error}</p> : null}

          {result ? (
            <section aria-label={t("emailResults")} className="pool-email-invite__results">
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
        </div>
      ) : null}
    </section>
  );
}
