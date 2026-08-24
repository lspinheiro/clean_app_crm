"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  finishPushPrompt,
  getPushPromptState,
  PUSH_PROMPT_STATE,
  subscribeToPush,
} from "@/lib/push";

export function PushOptInPrompt() {
  const t = useTranslations("PushOptIn");
  const [open, setOpen] = useState(
    () => getPushPromptState() === PUSH_PROMPT_STATE.pending,
  );
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!open) return null;

  function skip() {
    finishPushPrompt(PUSH_PROMPT_STATE.declined);
    setOpen(false);
  }

  async function accept() {
    setPending(true);
    setFailed(false);
    const subscribed = await subscribeToPush();
    if (!subscribed) {
      setFailed(true);
      setPending(false);
      return;
    }
    finishPushPrompt(PUSH_PROMPT_STATE.accepted);
    setOpen(false);
  }

  return (
    <section aria-labelledby="push-opt-in-title" className="push-opt-in">
      <div>
        <h2 className="push-opt-in__title" id="push-opt-in-title">
          {t("title")}
        </h2>
        <p className="push-opt-in__body">{t("body")}</p>
        {failed ? <p aria-live="polite">{t("error")}</p> : null}
      </div>
      <div className="push-opt-in__actions">
        <button className="button" disabled={pending} onClick={() => void accept()} type="button">
          {pending ? t("pending") : t("accept")}
        </button>
        <button
          className="button button--secondary"
          disabled={pending}
          onClick={skip}
          type="button"
        >
          {t("skip")}
        </button>
      </div>
    </section>
  );
}
