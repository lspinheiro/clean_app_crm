"use client";

import { Check, Copy, Link2, MessageCircle, RefreshCw, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

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
  const [activeCode, setActiveCode] = useState(initialCode);
  const [activeInviteId, setActiveInviteId] = useState(initialInviteId);
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
      setStatus(t("newCodeGenerated"));
      router.refresh();
      setRotating(false);
    } catch {
      setHasError(true);
      setStatus(t("activeCodeNotConfirmed"));
      window.location.reload();
    }
  }

  function shareOnWhatsApp() {
    if (!whatsAppShareUrl) return;
    window.open(whatsAppShareUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="cleaners-layout">
      <section className="cleaners-invite-card" aria-labelledby="cleaners-invite-heading">
        <header className="cleaners-card-heading">
          <span aria-hidden="true" className="cleaners-card-icon"><Link2 size={20} /></span>
          <div>
            <h2 id="cleaners-invite-heading">{t("inviteTitle")}</h2>
            <p>{t("inviteDescription")}</p>
          </div>
        </header>

        {activeCode && joinUrl ? (
          <div className="invite-display">
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
              <strong data-testid="invite-code">{activeCode}</strong>
            </div>
          </div>
        ) : (
          <div className="invite-empty">
            <p>{t("noCode")}</p>
            <span>{t("generateBeforeSharing")}</span>
          </div>
        )}

        <div className="cleaners-invite-actions">
          <button
            className="button"
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
          <button
            className="button button--secondary"
            disabled={!whatsAppShareUrl || copying !== null || rotating}
            onClick={shareOnWhatsApp}
            type="button"
          >
            <MessageCircle aria-hidden="true" size={17} />
            {t("shareOnWhatsApp")}
          </button>
          <button
            className="button button--secondary"
            disabled={rotating || copying !== null}
            onClick={() => void generateNewCode()}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={rotating ? "button-spinner" : undefined}
              size={17}
            />
            {rotating ? t("generating") : t("generateCode")}
          </button>
        </div>
        <p
          aria-live="polite"
          className={`cleaners-action-status${hasError ? " cleaners-action-status--error" : ""}`}
          role="status"
        >
          {status}
        </p>
        <p className="invite-rotation-note">
          {t("rotationNote")}
        </p>
        <CleanerEmailInvite
          companyName={companyName}
          inviteId={activeInviteId}
          joinUrl={joinUrl}
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
            {members.map((member) => (
              <li key={member.id}>
                <span aria-hidden="true" className="member-initial">
                  {member.name.trim().charAt(0).toUpperCase()}
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
  );
}
