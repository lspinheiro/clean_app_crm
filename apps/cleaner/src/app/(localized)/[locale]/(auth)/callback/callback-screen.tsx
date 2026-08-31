"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { normaliseInviteCode } from "@/features/join/invite";
import { localisedAddress, type AppLocale } from "@/i18n/config";
import { getSupabaseClient } from "@/lib/supabase/client";

function safeReturnPath(rawPath: string | null, locale: AppLocale): `/${AppLocale}${string}` {
  if (!rawPath) return localisedAddress(locale, "/login");
  const expectedPath = localisedAddress(locale, "/join");
  const parsed = new URL(rawPath, "https://cleaner.invalid");
  const postingCode = normaliseInviteCode(parsed.searchParams.get("code") ?? "");
  if (parsed.origin !== "https://cleaner.invalid" || parsed.pathname !== expectedPath || !postingCode) {
    return localisedAddress(locale, "/login");
  }
  return localisedAddress(locale, "/join", `?code=${encodeURIComponent(postingCode)}`);
}

export function CallbackScreen() {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Auth");
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function finishAuthentication() {
      setFailed(false);
      const supabase = getSupabaseClient();
      const sessionResult = await supabase.auth.getSession();
      if (sessionResult.data.session) return true;

      const authCode = searchParams.get("code");
      if (!authCode) return false;
      const exchange = await supabase.auth.exchangeCodeForSession(authCode);
      return !exchange.error && Boolean(exchange.data.session);
    }

    void finishAuthentication().then((succeeded) => {
      if (!active) return;
      if (succeeded) {
        router.replace(safeReturnPath(searchParams.get("next"), locale));
      } else {
        setFailed(true);
      }
    });

    return () => {
      active = false;
    };
  }, [attempt, locale, router, searchParams]);

  if (failed) {
    return (
      <div className="invite-problem" role="alert">
        <p>{t("oauthCallbackError")}</p>
        <button
          className="button button--secondary"
          onClick={() => setAttempt((value) => value + 1)}
          type="button"
        >
          {t("oauthRetry")}
        </button>
      </div>
    );
  }

  return <p className="screen-lead" role="status">{t("oauthCompleting")}</p>;
}
