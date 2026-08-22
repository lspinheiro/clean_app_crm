"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { z } from "zod";

import { LanguageSwitcher } from "@/components/language-switcher";
import { normaliseInviteCode } from "@/features/join/invite";
import { isAppLocale, localePath, persistLocaleCookie, type AppLocale } from "@/i18n/config";
import { evaluateCleanerAccess } from "@/lib/auth/access";
import { getSupabaseClient } from "@/lib/supabase/client";

export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Auth");
  const [error, setError] = useState<
    | "checkDetails"
    | "cleanerOnly"
    | "incorrectCredentials"
    | "invalidEmail"
    | "missingPassword"
    | "preferenceError"
    | null
  >(null);
  const [pending, setPending] = useState(false);

  const inviteCode = normaliseInviteCode(searchParams.get("code") ?? "");
  const notAuthorised = searchParams.get("error") === "not-authorised";

  async function signIn(formData: FormData) {
    setPending(true);
    setError(null);

    const parsed = z
      .object({
        email: z.email("invalidEmail"),
        password: z.string().min(1, "missingPassword"),
      })
      .safeParse({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    if (!parsed.success) {
      const key = parsed.error.issues[0]?.message;
      setError(key === "invalidEmail" || key === "missingPassword" ? key : "checkDetails");
      setPending(false);
      return;
    }

    const supabase = getSupabaseClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword(parsed.data);
    if (signInError || !data.user) {
      setError("incorrectCredentials");
      setPending(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, preferred_locale")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!inviteCode) {
      const { data: membership } = await supabase
        .from("cleaner_pool_memberships")
        .select("profile_id, status")
        .eq("profile_id", data.user.id)
        .limit(1)
        .maybeSingle();

      if (
        evaluateCleanerAccess({ userId: data.user.id, profile, membership }).kind === "denied"
      ) {
        await supabase.auth.signOut();
        setError("cleanerOnly");
        setPending(false);
        return;
      }
    }

    const targetLocale = isAppLocale(profile?.preferred_locale)
      ? profile.preferred_locale
      : locale;
    if (!isAppLocale(profile?.preferred_locale)) {
      const { error: preferenceError } = await supabase.rpc("set_preferred_locale", {
        target_locale: targetLocale,
      });
      if (preferenceError) {
        setError("preferenceError");
        setPending(false);
        return;
      }
    }
    persistLocaleCookie(targetLocale);

    if (inviteCode) {
      router.replace(
        `${localePath(targetLocale, "/join")}?code=${encodeURIComponent(inviteCode)}`,
      );
      return;
    }

    router.replace(localePath(targetLocale, "/board"));
  }

  return (
    <>
      <div className="auth-toolbar">
        <LanguageSwitcher compact disabled={pending} />
      </div>
      <div>
        <h1 className="screen-title">{t("title")}</h1>
        <p className="screen-lead">
          {inviteCode ? t("inviteLead") : t("lead")}
        </p>
      </div>
      {notAuthorised && !inviteCode ? (
        <p className="form-error" role="alert">
          {t("notAuthorised")}
        </p>
      ) : null}
      <form
        className="form-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void signIn(new FormData(event.currentTarget));
        }}
      >
        <div className="field">
          <label htmlFor="email">{t("email")}</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">{t("password")}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        ) : null}
        <button className="button" disabled={pending} type="submit">
          {pending ? t("pending") : t("submit")}
        </button>
      </form>
    </>
  );
}
