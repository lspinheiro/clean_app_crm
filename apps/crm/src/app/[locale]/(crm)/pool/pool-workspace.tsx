"use client";

import { Check, Copy, Link2, RefreshCw, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { rotatePoolInvite } from "@/app/actions/pool";
import {
  buildCleanerJoinUrl,
  buildInviteMessage,
  formatJoinedDate,
} from "@/features/pool/invite";
import type { PoolMember } from "@/features/pool/types";
import type { AppLocale } from "@/i18n/config";
import { useRouter } from "@/i18n/navigation";
import { localiseUserMessage } from "@/i18n/user-message";

type PoolWorkspaceProps = {
  cleanerAppUrl: string;
  companyName: string;
  initialCode: string | null;
  members: PoolMember[];
};

export function PoolWorkspace({
  cleanerAppUrl,
  companyName,
  initialCode,
  members,
}: PoolWorkspaceProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Pool");
  const router = useRouter();
  const [activeCode, setActiveCode] = useState(initialCode);
  const [copying, setCopying] = useState<"link" | "message" | null>(null);
  const [rotating, setRotating] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const joinUrl = activeCode ? buildCleanerJoinUrl(cleanerAppUrl, activeCode) : null;
  const inviteMessage = activeCode && joinUrl
    ? buildInviteMessage(companyName, joinUrl, activeCode, (values) =>
        t("inviteMessage", values))
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
      const result = await rotatePoolInvite();
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
      setStatus(t("newCodeGenerated"));
      router.refresh();
      setRotating(false);
    } catch {
      setHasError(true);
      setStatus(t("activeCodeNotConfirmed"));
      window.location.reload();
    }
  }

  return (
    <div className="pool-layout">
      <section className="pool-invite-card" aria-labelledby="pool-invite-heading">
        <header className="pool-card-heading">
          <span aria-hidden="true" className="pool-card-icon"><Link2 size={20} /></span>
          <div>
            <h2 id="pool-invite-heading">{t("inviteTitle")}</h2>
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

        <div className="pool-invite-actions">
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
          className={`pool-action-status${hasError ? " pool-action-status--error" : ""}`}
          role="status"
        >
          {status}
        </p>
        <p className="invite-rotation-note">
          {t("rotationNote")}
        </p>
      </section>

      <section className="pool-members-card" aria-labelledby="pool-members-heading">
        <header className="pool-card-heading pool-members-heading">
          <span aria-hidden="true" className="pool-card-icon"><UserRound size={20} /></span>
          <div>
            <h2 id="pool-members-heading">{t("activeCleaners")}</h2>
            <p>{t("memberCount", { count: members.length })}</p>
          </div>
        </header>

        {members.length ? (
          <ul aria-label={t("members")} className="pool-member-list">
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
          <div className="pool-members-empty">
            <p>{t("noMembers")}</p>
            <span>{t("shareToBuild")}</span>
          </div>
        )}
      </section>
    </div>
  );
}
