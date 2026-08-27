"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { requestEmployeeInvitationLinkAction } from "@/app/actions/employee-invitations";

type RequestNewLinkProps = {
  invitationId: string;
  /** The masked address the preview reported, so the reader can check their own inbox. */
  inviteeHint: string | null;
};

/**
 * The invitation record lives seven days; the token in the e-mail dies on the first GET, and
 * a link scanner or a reload spends it. Before this the only recourse was asking an admin to
 * revoke and re-invite, which mints a new id and orphans the link already in the inbox.
 */
export function RequestNewLink({ invitationId, inviteeHint }: RequestNewLinkProps) {
  const t = useTranslations("EmployeeInvitationAcceptance");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function requestLink() {
    setState("sending");
    const result = await requestEmployeeInvitationLinkAction(invitationId);
    // The action answers the same way whether or not it sent, so that holding a link id
    // cannot be used to discover which invitations are live.
    setState(result.ok ? "sent" : "failed");
  }

  if (state === "sent") {
    return (
      <p className="auth-panel__intro" role="status">
        {t("requestLinkSent", { invitee: inviteeHint ?? "" })}
      </p>
    );
  }

  return (
    <>
      <button
        className="button"
        disabled={state === "sending"}
        onClick={() => void requestLink()}
        type="button"
      >
        {state === "sending" ? t("requestLinkSending") : t("requestLink")}
      </button>
      {state === "failed" ? (
        <p className="form-error" role="alert">
          {t("requestLinkFailed")}
        </p>
      ) : null}
    </>
  );
}
