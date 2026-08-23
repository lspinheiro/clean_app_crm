"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  dismissInstallOffer,
  promptInstall,
  shouldOfferInstall,
  subscribeToInstallStatus,
} from "@/lib/install";

export function InstallPrompt() {
  const t = useTranslations("InstallPrompt");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(
    () => subscribeToInstallStatus(() => setOpen(shouldOfferInstall())),
    [],
  );

  if (!open) return null;

  function skip() {
    dismissInstallOffer();
    setOpen(false);
  }

  async function install() {
    setPending(true);
    setFailed(false);
    const outcome = await promptInstall();
    setPending(false);
    setOpen(outcome === "unavailable");
    setFailed(outcome === "unavailable");
  }

  return (
    <section aria-labelledby="install-prompt-title" className="upgrade-prompt">
      <div>
        <h2 className="upgrade-prompt__title" id="install-prompt-title">
          {t("title")}
        </h2>
        <p className="upgrade-prompt__body">{t("body")}</p>
        {failed ? <p className="field-error" role="alert">{t("error")}</p> : null}
      </div>
      <div className="upgrade-prompt__actions">
        <button className="button" disabled={pending} onClick={() => void install()} type="button">
          {pending ? t("pending") : t("accept")}
        </button>
        <button className="button button--secondary" disabled={pending} onClick={skip} type="button">
          {t("skip")}
        </button>
      </div>
    </section>
  );
}
