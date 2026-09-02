"use client";

import { Copy, Mail, MessageCircle, Plus, UserRound, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { revokePosting } from "@/app/actions/postings";
import {
  buildCleanerJoinUrl,
  buildWhatsAppShareUrl,
  formatJoinedDate,
} from "@/features/cleaners/invite";
import type { CleanerMember } from "@/features/cleaners/types";
import type { PostingIntent, PostingSummary } from "@/features/postings/types";
import type { AppLocale } from "@/i18n/config";
import { Link, useRouter } from "@/i18n/navigation";
import { localiseUserMessage } from "@/i18n/user-message";

import { CleanerEmailInvite } from "./cleaner-email-invite";

type CleanersWorkspaceProps = {
  cleanerAppUrl: string;
  companyName: string;
  members: CleanerMember[];
  postings: PostingSummary[];
};

function memberInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0]?.charAt(0) ?? "";
  const last = words.length > 1 ? words.at(-1)?.charAt(0) ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

export function CleanersWorkspace({ cleanerAppUrl, companyName, members, postings }: CleanersWorkspaceProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Postings");
  const cleanersT = useTranslations("Cleaners");
  const router = useRouter();
  const [emailPostingId, setEmailPostingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);

  function intentLabel(intent: PostingIntent) {
    return t(`intent.${intent}.label`);
  }

  async function copyPostingLink(posting: PostingSummary) {
    setHasError(false);
    try {
      await navigator.clipboard.writeText(buildCleanerJoinUrl(cleanerAppUrl, posting.code));
      setStatus(t("copied"));
    } catch {
      setHasError(true);
      setStatus(t("copyFailed"));
    }
  }

  function sharePosting(posting: PostingSummary) {
    const postingUrl = buildCleanerJoinUrl(cleanerAppUrl, posting.code);
    const message = t("shareMessage", {
      companyName,
      intent: intentLabel(posting.intent),
      postingUrl,
    });
    window.open(buildWhatsAppShareUrl(message), "_blank", "noopener,noreferrer");
  }

  async function handleRevoke(posting: PostingSummary) {
    setRevokingId(posting.id);
    setHasError(false);
    setStatus("");
    try {
      const result = await revokePosting(posting.id);
      if (!result.ok) {
        setHasError(true);
        setStatus(localiseUserMessage(result.error, locale) ?? t("revokeFailed"));
      } else {
        if (emailPostingId === posting.id) setEmailPostingId(null);
        router.refresh();
      }
    } catch {
      setHasError(true);
      setStatus(t("revokeFailed"));
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="cleaners-workspace">
      <section className="postings-workspace" aria-labelledby="postings-heading">
        <div className="postings-workspace__heading">
          <div>
            <h2 id="postings-heading">{t("workspaceTitle")}</h2>
            <p>{t("workspaceDescription")}</p>
          </div>
          <Link className="button" href="/cleaners/postings/new">
            <Plus aria-hidden="true" size={17} />
            {t("createAction")}
          </Link>
        </div>

        {postings.length ? (
          <div aria-label={t("listLabel")} className="posting-list" role="list">
            {postings.map((posting) => {
              const postingUrl = buildCleanerJoinUrl(cleanerAppUrl, posting.code);
              const isActive = posting.state === "active";
              const emailOpen = emailPostingId === posting.id;
              return (
                <article
                  aria-label={posting.publicDescription}
                  className="posting-card"
                  key={posting.id}
                  role="listitem"
                >
                  <div className="posting-card__summary">
                    <div className="posting-card__main">
                      <div className="posting-card__meta">
                        <span className="posting-intent-chip">{intentLabel(posting.intent)}</span>
                        <span className={`status-chip posting-state-chip posting-state-chip--${posting.state}`}>
                          {isActive
                            ? t("stateActive")
                            : t("stateClosed", {
                                reason: posting.closingReason
                                  ? t(`closingReason.${posting.closingReason}`)
                                  : "",
                              })}
                        </span>
                      </div>
                      <h3>{posting.publicDescription}</h3>
                      <div className="posting-card__facts">
                        <span className="tabular-numerals">{t("applications", { count: posting.applicationCount })}</span>
                        <span>{t("created", { date: formatJoinedDate(posting.createdAt, locale) })}</span>
                        <a href={postingUrl} rel="noreferrer" target="_blank">{postingUrl}</a>
                      </div>
                    </div>
                    {isActive ? (
                      <div className="posting-card__actions">
                        <button
                          aria-label={t("copyLinkFor", { description: posting.publicDescription })}
                          className="button button--secondary button--small"
                          onClick={() => void copyPostingLink(posting)}
                          type="button"
                        ><Copy aria-hidden="true" size={15} />{t("copyLink")}</button>
                        <button
                          aria-label={t("shareWhatsAppFor", { description: posting.publicDescription })}
                          className="button button--secondary button--small"
                          onClick={() => sharePosting(posting)}
                          type="button"
                        ><MessageCircle aria-hidden="true" size={15} />{t("shareWhatsApp")}</button>
                        <button
                          aria-expanded={emailOpen}
                          aria-label={t("sendEmailFor", { description: posting.publicDescription })}
                          className="button button--secondary button--small"
                          onClick={() => setEmailPostingId(emailOpen ? null : posting.id)}
                          type="button"
                        ><Mail aria-hidden="true" size={15} />{t("sendEmail")}</button>
                        <button
                          aria-label={t("revokeFor", { description: posting.publicDescription })}
                          className="button button--secondary button--danger button--small"
                          disabled={revokingId !== null}
                          onClick={() => void handleRevoke(posting)}
                          type="button"
                        >
                          <XCircle aria-hidden="true" size={15} />
                          {revokingId === posting.id ? t("revoking") : t("revoke")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {emailOpen ? (
                    <CleanerEmailInvite
                      companyName={companyName}
                      joinUrl={postingUrl}
                      postingId={posting.id}
                      postingIntent={posting.intent}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="records-empty postings-empty">
            <h3>{t("emptyTitle")}</h3>
            <p>{t("emptyDescription")}</p>
          </div>
        )}
        <p aria-live="polite" className={`cleaners-action-status${hasError ? " cleaners-action-status--error" : ""}`} role="status">
          {status}
        </p>
      </section>

      <section className="cleaners-members-card" aria-labelledby="cleaners-members-heading">
        <header className="cleaners-card-heading cleaners-members-heading">
          <span aria-hidden="true" className="cleaners-card-icon"><UserRound size={20} /></span>
          <div>
            <h2 id="cleaners-members-heading">{cleanersT("activeCleaners")}</h2>
            <p>{cleanersT("memberCount", { count: members.length })}</p>
          </div>
        </header>
        {members.length ? (
          <ul aria-label={cleanersT("members")} className="cleaners-member-list">
            {members.map((member, index) => (
              <li key={member.id}>
                <span aria-hidden="true" className={`member-initial member-initial--tone-${index % 3}`}>
                  {memberInitials(member.name)}
                </span>
                <div>
                  <strong>{member.name}</strong>
                  <span>{cleanersT("joined", { date: formatJoinedDate(member.joinedAt, locale) })}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="cleaners-members-empty">
            <p>{cleanersT("noMembers")}</p>
            <span>{cleanersT("shareToBuild")}</span>
          </div>
        )}
      </section>
    </div>
  );
}
