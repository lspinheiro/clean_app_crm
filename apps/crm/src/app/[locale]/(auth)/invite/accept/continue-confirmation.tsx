"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";

import { continuePendingConfirmationAction } from "@/app/actions/auth-confirmation";

type ContinueConfirmationProps = {
  failedLabel: string;
  /** The way back in when the token turns out to be spent — a new link, or nothing to offer. */
  fallback?: ReactNode;
  label: string;
  workingLabel: string;
};

/**
 * The one step a person takes. `/auth/confirm` parks the token the e-mail carried and hands
 * over here rather than exchanging it, so the scanners, gateways and prefetches that fetch the
 * link on the invitee's behalf leave it unspent.
 *
 * Labels arrive as props because the same button serves the employee and founder invitations,
 * which read from different message namespaces.
 */
export function ContinueConfirmation({
  failedLabel,
  fallback,
  label,
  workingLabel,
}: ContinueConfirmationProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  async function open() {
    setState("working");
    const result = await continuePendingConfirmationAction();
    if (result.ok) {
      // The exchange wrote the session on its own response; re-reading the page picks it up and
      // falls through to the acceptance form. Same move as `UseAnotherAccount`.
      router.refresh();
      return;
    }
    setState("failed");
  }

  if (state === "failed") {
    return (
      <>
        <p className="form-error" role="alert">
          {failedLabel}
        </p>
        {fallback}
      </>
    );
  }

  return (
    <button
      className="button"
      disabled={state === "working"}
      onClick={() => void open()}
      type="button"
    >
      {state === "working" ? workingLabel : label}
    </button>
  );
}
