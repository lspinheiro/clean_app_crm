"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import {
  cleanerCountCopy,
  inviteProblem,
  isInviteState,
  joinFailureKey,
  normaliseInviteCode,
  type JoinFailureKey,
  type InvitePreview,
} from "@/features/join/invite";
import {
  cleanerDetailsKeySchema,
  isJoinValidationKey,
  registrationKeySchema,
  type JoinValidationKey,
} from "@/features/join/schema";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  isAppLocale,
  localeFromCookieString,
  localePath,
  persistLocaleCookie,
  type AppLocale,
} from "@/i18n/config";
import { isMissingSessionError, isStaleSessionError } from "@/lib/auth/session-error";
import { getSupabaseClient } from "@/lib/supabase/client";

const unknownInvite: InvitePreview = { state: "unknown", companyName: null, cleanerCount: 0 };

type Screen =
  | { status: "loading" }
  | { status: "no-code" }
  | { status: "problem"; invite: InvitePreview }
  | { status: "ready"; invite: InvitePreview; code: string };

type AccountState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "error" }
  | {
      status: "authenticated";
      email: string | null;
      userId: string;
      profile: {
        full_name: string;
        phone: string | null;
        preferred_locale: string | null;
        suburb: string | null;
      };
    };

type CleanerDetails = {
  fullName: string;
  phone: string;
  suburb: string;
};

type JoinErrorKey =
  | JoinFailureKey
  | JoinValidationKey
  | "accountExists"
  | "checkDetails"
  | "confirmEmail"
  | "createAccountError"
  | "signOutError";

export function JoinScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Join");
  const commonT = useTranslations("Common");
  const code = normaliseInviteCode(searchParams.get("code") ?? "");

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [account, setAccount] = useState<AccountState>({ status: "loading" });
  const [accountAttempt, setAccountAttempt] = useState(0);
  const [error, setError] = useState<JoinErrorKey | null>(null);
  const [signUpAccountExists, setSignUpAccountExists] = useState(false);
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!code) return;
    let active = true;

    async function loadInvite(): Promise<InvitePreview> {
      const { data, error: previewError } = await getSupabaseClient().rpc(
        "cleaner_invite_preview",
        { invite_code: code },
      );
      if (previewError) return unknownInvite;

      const row = data?.[0];
      if (!row || !isInviteState(row.state)) return unknownInvite;
      return {
        state: row.state,
        companyName: row.company_name ?? null,
        cleanerCount: row.pool_size,
      };
    }

    void loadInvite().then((result) => {
      if (active) setInvite(result);
    });

    return () => {
      active = false;
    };
  }, [code]);

  useEffect(() => {
    if (!code) return;
    let active = true;

    async function loadAccount(): Promise<AccountState> {
      const supabase = getSupabaseClient();
      const { data, error: userError } = await supabase.auth.getUser();
      if (isMissingSessionError(userError)) return { status: "anonymous" };
      if (isStaleSessionError(userError)) {
        await supabase.auth.signOut({ scope: "local" });
        return { status: "anonymous" };
      }
      if (userError) return { status: "error" };
      if (!data.user) return { status: "anonymous" };

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, phone, preferred_locale, suburb")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profileError || !profile) return { status: "error" };

      return {
        status: "authenticated",
        email: data.user.email ?? null,
        userId: data.user.id,
        profile,
      };
    }

    void loadAccount().then((result) => {
      if (active) setAccount(result);
    });

    return () => {
      active = false;
    };
  }, [accountAttempt, code]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const screen: Screen = !code
    ? { status: "no-code" }
    : invite === null
      ? { status: "loading" }
      : invite.state === "active"
        ? { status: "ready", invite, code }
        : { status: "problem", invite };

  async function completeJoin(details: CleanerDetails, savedLocale?: string | null) {
    const supabase = getSupabaseClient();
    const { error: joinError } = await supabase.rpc("join_company_pool", {
      invite_code: code,
      full_name: details.fullName,
      phone: details.phone,
      suburb: details.suburb,
    });
    if (joinError) {
      setError(joinFailureKey(joinError.message));
      setPending(false);
      return;
    }

    const explicitLocale = localeFromCookieString(document.cookie);
    const targetLocale = explicitLocale ?? (isAppLocale(savedLocale) ? savedLocale : locale);
    // The join is already committed. A transient preference failure must not strand the
    // cleaner on an invitation she has successfully accepted.
    await supabase.rpc("set_preferred_locale", { target_locale: targetLocale });
    persistLocaleCookie(targetLocale);
    router.replace(localePath(targetLocale, "/board"));
  }

  async function registerAndJoin(formData: FormData) {
    setPending(true);
    setError(null);
    setSignUpAccountExists(false);

    const parsed = registrationKeySchema.safeParse({
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      suburb: String(formData.get("suburb") ?? ""),
    });
    if (!parsed.success) {
      const key = parsed.error.issues[0]?.message;
      setError(isJoinValidationKey(key) ? key : "checkDetails");
      setPending(false);
      return;
    }

    const { data, error: signUpError } = await getSupabaseClient().auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { full_name: parsed.data.fullName, preferred_locale: locale } },
    });

    if (signUpError) {
      const accountExists =
        signUpError.code === "user_already_exists" || signUpError.status === 422;
      setSignUpAccountExists(accountExists);
      setError(
        accountExists
          ? "accountExists"
          : "createAccountError",
      );
      setPending(false);
      return;
    }
    if (!data.session) {
      setError("confirmEmail");
      setPending(false);
      return;
    }

    await completeJoin(parsed.data, locale);
  }

  async function joinExistingAccount(formData: FormData) {
    setPending(true);
    setError(null);

    const parsed = cleanerDetailsKeySchema.safeParse({
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      suburb: String(formData.get("suburb") ?? ""),
    });
    if (!parsed.success) {
      const key = parsed.error.issues[0]?.message;
      setError(isJoinValidationKey(key) ? key : "checkDetails");
      setPending(false);
      return;
    }

    await completeJoin(parsed.data, account.status === "authenticated"
      ? account.profile.preferred_locale
      : null);
  }

  async function switchAccount() {
    setPending(true);
    setError(null);
    const { error: signOutError } = await getSupabaseClient().auth.signOut({ scope: "local" });
    if (signOutError) {
      setError("signOutError");
      setPending(false);
      return;
    }

    setAccount({ status: "anonymous" });
    setPending(false);
  }

  if (screen.status === "loading") {
    return (
      <>
        <div className="auth-toolbar">
          <LanguageSwitcher
            authenticated={account.status === "authenticated"}
            compact
            disabled={pending || !hydrated}
          />
        </div>
        <p className="screen-lead" role="status">{t("loadingInvite")}</p>
      </>
    );
  }

  if (screen.status === "no-code" || screen.status === "problem") {
    const problem =
      screen.status === "no-code"
        ? null
        : inviteProblem(screen.invite);
    const message = screen.status === "no-code"
      ? t("missingCode")
      : problem?.values
        ? t(problem.key, problem.values)
        : t(problem?.key ?? "inviteUnknown");

    return (
      <>
        <div className="auth-toolbar">
          <LanguageSwitcher
            authenticated={account.status === "authenticated"}
            compact
            disabled={pending || !hydrated}
          />
        </div>
        <h1 className="screen-title">{t("cannotOpenTitle")}</h1>
        <div className="invite-problem" role="alert">
          <p>{message}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="auth-toolbar">
        <LanguageSwitcher
          authenticated={account.status === "authenticated"}
          compact
          disabled={pending || !hydrated}
        />
      </div>
      <div>
        <h1 className="screen-title">{t("title")}</h1>
        <p className="screen-lead">{t("lead")}</p>
      </div>
      <div className="invite-card">
        <span className="invite-card__company">{screen.invite.companyName}</span>
        <span className="invite-card__cleaners">
          {(() => {
            const count = cleanerCountCopy(screen.invite.cleanerCount);
            return count.values ? t(count.key, count.values) : t(count.key);
          })()}
        </span>
      </div>
      {account.status === "loading" ? (
        <p className="screen-lead" role="status">
          {t("checkingAccount")}
        </p>
      ) : null}

      {account.status === "error" ? (
        <div className="invite-problem" role="alert">
          <p>{t("accountCheckError")}</p>
          <button
            className="button button--secondary"
            onClick={() => {
              setAccount({ status: "loading" });
              setAccountAttempt((attempt) => attempt + 1);
            }}
            type="button"
          >
            {commonT("retry")}
          </button>
        </div>
      ) : null}

      {account.status === "anonymous" ? (
        <>
          <div className="auth-choice">
            <p>{t("alreadyHaveAccount")}</p>
            <Link
              className="button button--secondary"
              href={`${localePath(locale, "/login")}?code=${encodeURIComponent(screen.code)}`}
            >
              {t("signInToJoin")}
            </Link>
          </div>
          <div className="auth-divider" role="separator">
            <span>{t("createAccountDivider")}</span>
          </div>
          <form
            className="form-stack"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void registerAndJoin(new FormData(event.currentTarget));
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
                autoComplete="new-password"
                required
              />
              <p className="field-hint">{t("passwordHint")}</p>
            </div>
            <CleanerDetailsFields />
            {error ? (
              <div className="form-error" ref={errorRef} role="alert" tabIndex={-1}>
                <p>{t(error)}</p>
                {signUpAccountExists ? (
                  <Link
                    className="form-error__action"
                    href={`${localePath(locale, "/login")}?code=${encodeURIComponent(screen.code)}`}
                  >
                    {t("signInToJoin")}
                  </Link>
                ) : null}
              </div>
            ) : null}
            <button className="button" disabled={pending || !hydrated} type="submit">
              {pending ? t("joining") : t("joinStaff")}
            </button>
            <p className="consent-caption">
              {t("newAccountConsent")}
            </p>
          </form>
        </>
      ) : null}

      {account.status === "authenticated" ? (
        <form
          className="form-stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void joinExistingAccount(new FormData(event.currentTarget));
          }}
        >
          <div className="auth-account">
            <div className="auth-account__identity">
              <span>{t("signedInAs")}</span>
              <strong>{account.email ?? t("signedInAccount")}</strong>
            </div>
            <button
              className="text-action"
              disabled={pending || !hydrated}
              onClick={() => void switchAccount()}
              type="button"
            >
              {t("useAnotherAccount")}
            </button>
          </div>
          <CleanerDetailsFields
            fullName={account.profile.full_name}
            phone={account.profile.phone ?? ""}
            suburb={account.profile.suburb ?? ""}
          />
          {error ? (
            <div className="form-error" ref={errorRef} role="alert" tabIndex={-1}>
              <p>{t(error)}</p>
            </div>
          ) : null}
          <button className="button" disabled={pending || !hydrated} type="submit">
            {pending ? t("joining") : t("joinStaff")}
          </button>
          <p className="consent-caption">
            {t("existingAccountConsent")}
          </p>
        </form>
      ) : null}
    </>
  );
}

function CleanerDetailsFields({
  fullName = "",
  phone = "",
  suburb = "",
}: Readonly<{ fullName?: string; phone?: string; suburb?: string }>) {
  const t = useTranslations("Join");

  return (
    <>
      <div className="field">
        <label htmlFor="fullName">{t("fullName")}</label>
        <input
          defaultValue={fullName}
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="phone">{t("phone")}</label>
        <input
          defaultValue={phone}
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="suburb">{t("suburb")}</label>
        <input
          defaultValue={suburb}
          id="suburb"
          name="suburb"
          autoComplete="address-level2"
          required
        />
        <p className="field-hint">{t("suburbHint")}</p>
      </div>
    </>
  );
}
