"use client";

import { Check, Copy, Link2, MessageCircle, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { rotateCleanerInvite } from "@/app/actions/cleaners";
import {
  buildCleanerJoinUrl,
  buildInviteMessage,
  buildWhatsAppShareUrl,
  formatJoinedDate,
} from "@/features/cleaners/invite";
import type { CleanerMember } from "@/features/cleaners/types";
import type { AppLocale } from "@/i18n/config";
import { useRouter } from "@/i18n/navigation";
import { localiseUserMessage } from "@/i18n/user-message";

import { CleanerEmailInvite } from "./cleaner-email-invite";

type CleanersWorkspaceProps = {
  cleanerAppUrl: string;
  companyName: string;
  initialCode: string | null;
  initialInviteId: string | null;
  members: CleanerMember[];
};

function memberInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0]?.charAt(0) ?? "";
  const last = words.length > 1 ? words.at(-1)?.charAt(0) ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

export function CleanersWorkspace({
  cleanerAppUrl,
  companyName,
  initialCode,
  initialInviteId,
  members,
}: CleanersWorkspaceProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Cleaners");
  const router = useRouter();
  const replaceDialogRef = useRef<HTMLDialogElement>(null);
  const [activeCode, setActiveCode] = useState(initialCode);
  const [activeInviteId, setActiveInviteId] = useState(initialInviteId);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [copying, setCopying] = useState<"link" | "message" | null>(null);
  const [rotating, setRotating] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const joinUrl = activeCode ? buildCleanerJoinUrl(cleanerAppUrl, activeCode) : null;
  const inviteMessage = activeCode && joinUrl
    ? buildInviteMessage(companyName, joinUrl, activeCode, (values) =>
        t("inviteMessage", values))
    : null;
  const whatsAppShareUrl = inviteMessage
    ? buildWhatsAppShareUrl(inviteMessage)
    : null;

  async function copyToClipboard(value: string, kind: "link" | "message") {
    setCopying(kind);
    setHasError(false);
    setStatus(kind === "link" ? t("copyingSignup") : t("copyingInvite"));
    try {
      await navigator.clipboard.writeText(value);
      setStatus(kind === "link" ? t("signupCopied") : t("inviteCopied"));
    } catch {
      setHasError(true);
      setStatus(
        kind === "link"
          ? t("signupCopyFailed")
          : t("inviteCopyFailed"),
      );
    } finally {
      setCopying(null);
    }
  }

  async function generateNewCode() {
    setRotating(true);
    setHasError(false);
    setStatus(t("generatingCode"));
    try {
      const result = await rotateCleanerInvite();
      if (!result.ok) {
        setHasError(true);
        setStatus(
          t("reloadingInvite", {
            error: localiseUserMessage(result.error, locale) ?? result.error,
          }),
        );
        window.location.reload();
        return;
      }
      setActiveCode(result.code);
      setActiveInviteId(result.inviteId);
      setDetailsVisible(true);
      setStatus(t("newCodeGenerated"));
      replaceDialogRef.current?.close();
      router.refresh();
    } catch {
      setHasError(true);
      setStatus(t("activeCodeNotConfirmed"));
      window.location.reload();
    } finally {
      setRotating(false);
    }
  }

  function shareOnWhatsApp() {
    if (!whatsAppShareUrl) return;
    window.open(whatsAppShareUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="cleaners-workspace">
      <section aria-label={t("inviteStatusLabel")} className="cleaners-invite-status">
        <div className="cleaners-invite-status__state">
          <span
            aria-hidden="true"
            className={`cleaners-invite-status__dot${activeCode ? " cleaners-invite-status__dot--active" : ""}`}
          />
          <strong>{activeCode ? t("activeInvitation") : t("noActiveInvitation")}</strong>
          {activeCode ? <code data-testid="invite-code">{activeCode}</code> : null}
        </div>
        <div className="cleaners-invite-status__actions">
          {activeCode && joinUrl ? (
            <>
              <button
                className="text-action"
                disabled={copying !== null || rotating}
                onClick={() => void copyToClipboard(joinUrl, "link")}
                type="button"
              >
                <Copy aria-hidden="true" size={15} />
                {copying === "link" ? t("copying") : t("copyLink")}
              </button>
              <button
                aria-controls="cleaner-invite-details"
                aria-expanded={detailsVisible}
                className="text-action"
                onClick={() => setDetailsVisible((value) => !value)}
                type="button"
              >
                <ShieldCheck aria-hidden="true" size={15} />
                {detailsVisible ? t("hideInviteDetails") : t("inviteDetails")}
              </button>
            </>
          ) : (
            <button
              className="button"
              disabled={rotating}
              onClick={() => void generateNewCode()}
              type="button"
            >
              <Link2 aria-hidden="true" size={17} />
              {rotating ? t("generating") : t("createInvitation")}
            </button>
          )}
        </div>
      </section>

      <div className="cleaners-layout">
      <section className="cleaners-invite-card" aria-labelledby="cleaners-invite-heading">
        <header className="cleaners-card-heading">
          <span aria-hidden="true" className="cleaners-card-icon"><Link2 size={20} /></span>
          <div>
            <h2 id="cleaners-invite-heading">{t("inviteTitle")}</h2>
            <p>{t("inviteDescription")}</p>
          </div>
        </header>

        <div className={`cleaners-message-preview${inviteMessage ? "" : " cleaners-message-preview--empty"}`}>
          <span className="cleaners-message-preview__label">{t("inviteMessagePreview")}</span>
          <p>{inviteMessage ?? t("generateBeforeSharing")}</p>
        </div>

        {detailsVisible && activeCode && joinUrl ? (
          <div className="invite-display" id="cleaner-invite-details">
            <div className="invite-url-row">
              <span>{t("signupLink")}</span>
              <div className="invite-url-value">
                <a aria-label={t("signupLink")} href={joinUrl} rel="noreferrer" target="_blank">
                  {joinUrl}
                </a>
                <button
                  aria-label={t("copySignupLink")}
                  className="icon-button"
                  disabled={copying !== null || rotating}
                  onClick={() => void copyToClipboard(joinUrl, "link")}
                  type="button"
                >
                  {copying === "link" ? (
                    <RefreshCw aria-hidden="true" className="button-spinner" size={17} />
                  ) : status === t("signupCopied") ? (
                    <Check aria-hidden="true" size={17} />
                  ) : (
                    <Copy aria-hidden="true" size={17} />
                  )}
                </button>
              </div>
            </div>
            <div className="invite-code-block">
              <span>{t("inviteCode")}</span>
              <strong>{activeCode}</strong>
            </div>
          </div>
        ) : null}

        <p className="cleaners-share-hint">{t("sharedInviteHint")}</p>
        <div className="cleaners-invite-actions">
          <button
            className="button"
            disabled={!whatsAppShareUrl || copying !== null || rotating}
            onClick={shareOnWhatsApp}
            type="button"
          >
            <MessageCircle aria-hidden="true" size={17} />
            {t("shareOnWhatsApp")}
          </button>
          <button
            className="button button--secondary"
            disabled={!inviteMessage || copying !== null || rotating}
            onClick={() => inviteMessage && void copyToClipboard(inviteMessage, "message")}
            type="button"
          >
            {copying === "message" ? (
              <RefreshCw aria-hidden="true" className="button-spinner" size={17} />
            ) : status === t("inviteCopied") ? (
              <Check aria-hidden="true" size={17} />
            ) : (
              <Copy aria-hidden="true" size={17} />
            )}
            {copying === "message" ? t("copying") : t("copyInvite")}
          </button>
        </div>
        <p
          aria-live="polite"
          className={`cleaners-action-status${hasError ? " cleaners-action-status--error" : ""}`}
          role="status"
        >
          {status}
        </p>
        {detailsVisible && activeCode ? (
          <div className="cleaners-invite-details__replacement">
            <p>{t("rotationNote")}</p>
            <button
              className="button button--danger"
              disabled={rotating || copying !== null}
              onClick={() => replaceDialogRef.current?.showModal()}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={17} />
              {t("replaceInvitation")}
            </button>
          </div>
        ) : null}
        <CleanerEmailInvite
          companyName={companyName}
          inviteId={activeInviteId}
          joinUrl={joinUrl}
          key={activeInviteId ?? "no-active-invitation"}
        />
      </section>

      <section className="cleaners-members-card" aria-labelledby="cleaners-members-heading">
        <header className="cleaners-card-heading cleaners-members-heading">
          <span aria-hidden="true" className="cleaners-card-icon"><UserRound size={20} /></span>
          <div>
            <h2 id="cleaners-members-heading">{t("activeCleaners")}</h2>
            <p>{t("memberCount", { count: members.length })}</p>
          </div>
        </header>

        {members.length ? (
          <ul aria-label={t("members")} className="cleaners-member-list">
            {members.map((member, index) => (
              <li key={member.id}>
                <span
                  aria-hidden="true"
                  className={`member-initial member-initial--tone-${index % 3}`}
                >
                  {memberInitials(member.name)}
                </span>
                <div>
                  <strong>{member.name}</strong>
                  <span>
                    {t("joined", {
                      date: formatJoinedDate(member.joinedAt, locale),
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="cleaners-members-empty">
            <p>{t("noMembers")}</p>
            <span>{t("shareToBuild")}</span>
          </div>
        )}
      </section>
      </div>

      <dialog
        aria-describedby="replace-invitation-description"
        aria-labelledby="replace-invitation-title"
        className="record-dialog cleaners-replace-dialog"
        ref={replaceDialogRef}
      >
        <div>
          <h2 id="replace-invitation-title">{t("replaceInviteTitle")}</h2>
          <p id="replace-invitation-description">{t("replaceInviteDescription")}</p>
          <div className="dialog-actions">
            <button
              className="button button--secondary"
              disabled={rotating}
              onClick={() => replaceDialogRef.current?.close()}
              type="button"
            >
              {t("keepInvitation")}
            </button>
            <button
              className="button button--danger-solid"
              disabled={rotating}
              onClick={() => void generateNewCode()}
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={rotating ? "button-spinner" : undefined}
                size={17}
              />
              {rotating ? t("generating") : t("confirmReplaceInvitation")}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
