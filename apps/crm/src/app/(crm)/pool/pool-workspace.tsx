"use client";

import { Check, Copy, Link2, RefreshCw, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { rotatePoolInvite } from "@/app/actions/pool";
import {
  buildCleanerJoinUrl,
  buildInviteMessage,
  formatJoinedDate,
} from "@/features/pool/invite";
import type { PoolMember } from "@/features/pool/types";

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
  const router = useRouter();
  const [activeCode, setActiveCode] = useState(initialCode);
  const [copying, setCopying] = useState<"link" | "message" | null>(null);
  const [rotating, setRotating] = useState(false);
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const joinUrl = activeCode ? buildCleanerJoinUrl(cleanerAppUrl, activeCode) : null;
  const inviteMessage = activeCode && joinUrl
    ? buildInviteMessage(companyName, joinUrl, activeCode)
    : null;

  async function copyToClipboard(value: string, kind: "link" | "message") {
    setCopying(kind);
    setHasError(false);
    setStatus(kind === "link" ? "Copying cleaner signup link…" : "Copying invite message…");
    try {
      await navigator.clipboard.writeText(value);
      setStatus(kind === "link" ? "Cleaner signup link copied." : "Invite message copied.");
    } catch {
      setHasError(true);
      setStatus(
        kind === "link"
          ? "The cleaner signup link could not be copied. Select the link manually."
          : "The invite message could not be copied. Copy the link and code manually.",
      );
    } finally {
      setCopying(null);
    }
  }

  async function generateNewCode() {
    setRotating(true);
    setHasError(false);
    setStatus("Generating a new invite code…");
    try {
      const result = await rotatePoolInvite();
      if (!result.ok) {
        setHasError(true);
        setStatus(`${result.error} Reloading the current invite…`);
        window.location.reload();
        return;
      }
      setActiveCode(result.code);
      setStatus("New invite code generated. The previous code is no longer active.");
      router.refresh();
      setRotating(false);
    } catch {
      setHasError(true);
      setStatus("The active code could not be confirmed. Reloading the current invite…");
      window.location.reload();
    }
  }

  return (
    <div className="pool-layout">
      <section className="pool-invite-card" aria-labelledby="pool-invite-heading">
        <header className="pool-card-heading">
          <span aria-hidden="true" className="pool-card-icon"><Link2 size={20} /></span>
          <div>
            <h2 id="pool-invite-heading">Cleaner pool invite</h2>
            <p>Post this message in your company&apos;s WhatsApp group.</p>
          </div>
        </header>

        {activeCode && joinUrl ? (
          <div className="invite-display">
            <div className="invite-url-row">
              <span>Cleaner signup link</span>
              <div className="invite-url-value">
                <a aria-label="Cleaner signup link" href={joinUrl} rel="noreferrer" target="_blank">
                  {joinUrl}
                </a>
                <button
                  aria-label="Copy cleaner signup link"
                  className="icon-button"
                  disabled={copying !== null || rotating}
                  onClick={() => void copyToClipboard(joinUrl, "link")}
                  type="button"
                >
                  {copying === "link" ? (
                    <RefreshCw aria-hidden="true" className="button-spinner" size={17} />
                  ) : status === "Cleaner signup link copied." ? (
                    <Check aria-hidden="true" size={17} />
                  ) : (
                    <Copy aria-hidden="true" size={17} />
                  )}
                </button>
              </div>
            </div>
            <div className="invite-code-block">
              <span>Invite code</span>
              <strong data-testid="invite-code">{activeCode}</strong>
            </div>
          </div>
        ) : (
          <div className="invite-empty">
            <p>No active invite code.</p>
            <span>Generate one before sharing your cleaner signup link.</span>
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
            ) : status === "Invite message copied." ? (
              <Check aria-hidden="true" size={17} />
            ) : (
              <Copy aria-hidden="true" size={17} />
            )}
            {copying === "message" ? "Copying…" : "Copy invite message"}
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
            {rotating ? "Generating…" : "Generate new code"}
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
          Generating a new code revokes the previous code. Existing pool members are unchanged.
        </p>
      </section>

      <section className="pool-members-card" aria-labelledby="pool-members-heading">
        <header className="pool-card-heading pool-members-heading">
          <span aria-hidden="true" className="pool-card-icon"><UserRound size={20} /></span>
          <div>
            <h2 id="pool-members-heading">Active cleaners</h2>
            <p>{members.length} {members.length === 1 ? "cleaner" : "cleaners"} in this pool</p>
          </div>
        </header>

        {members.length ? (
          <ul aria-label="Active cleaner pool members" className="pool-member-list">
            {members.map((member) => (
              <li key={member.id}>
                <span aria-hidden="true" className="member-initial">
                  {member.name.trim().charAt(0).toUpperCase()}
                </span>
                <div>
                  <strong>{member.name}</strong>
                  <span>
                    Joined <time dateTime={member.joinedAt}>{formatJoinedDate(member.joinedAt)}</time>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="pool-members-empty">
            <p>No active cleaners yet.</p>
            <span>Share the invite message to start building the company pool.</span>
          </div>
        )}
      </section>
    </div>
  );
}
