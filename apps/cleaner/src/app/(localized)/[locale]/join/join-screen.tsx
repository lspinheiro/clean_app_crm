"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { formatCleanerPay, formatJobDate, formatJobDuration, formatJobTime } from "@/features/board/format";
import { normaliseInviteCode, joinFailureKey, type JoinFailureKey } from "@/features/join/invite";
import {
  parsePostingPreview,
  parseVisitorRelationship,
  type ActivePosting,
  type PostingPreview,
  type VisitorRelationship,
} from "@/features/join/posting";
import {
  applicationKeySchema,
  isJoinValidationKey,
  registrationKeySchema,
  type JoinValidationKey,
} from "@/features/join/schema";
import { formatSeriesTime, formatSeriesWeekday } from "@/features/offers/format";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  isAppLocale,
  localeFromCookieString,
  localePath,
  persistLocaleCookie,
  type AppLocale,
} from "@/i18n/config";
import { isMissingSessionError, isStaleSessionError } from "@/lib/auth/session-error";
import { isInAppBrowser } from "@/lib/auth/in-app-browser";
import { markPushPromptAfterJoin } from "@/lib/push";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getServiceLabel } from "@/i18n/service-label";

const unknownPosting: PostingPreview = { closingReason: "unknown", state: "dead" };

type Screen =
  | { status: "loading" }
  | { status: "no-code" }
  | { status: "unknown" }
  | { status: "inactive" }
  | { status: "ready"; posting: ActivePosting; code: string };

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
  | "googleSignInError"
  | "signOutError";

export function JoinScreen() {
  const searchParams = useSearchParams();
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Join");
  const commonT = useTranslations("Common");
  const code = normaliseInviteCode(searchParams.get("code") ?? "");

  const [posting, setPosting] = useState<PostingPreview | null>(null);
  const [account, setAccount] = useState<AccountState>({ status: "loading" });
  const [accountAttempt, setAccountAttempt] = useState(0);
  const [relationship, setRelationship] = useState<VisitorRelationship | "error" | "loading">("loading");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<JoinErrorKey | null>(null);
  const [signUpAccountExists, setSignUpAccountExists] = useState(false);
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();
  const inAppBrowser = hydrated && isInAppBrowser(window.navigator.userAgent);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!code) return;
    let active = true;

    async function loadPosting(): Promise<PostingPreview> {
      const { data, error: previewError } = await getSupabaseClient().rpc(
        "posting_preview",
        { posting_code: code },
      );
      if (previewError) return unknownPosting;

      const row = data?.[0];
      return row ? parsePostingPreview(row) : unknownPosting;
    }

    void loadPosting().then((result) => {
      if (active) setPosting(result);
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
    if (account.status !== "authenticated" || posting?.state !== "active") return;
    let active = true;
    const companyId = posting.companyId;

    async function loadRelationship() {
      const supabase = getSupabaseClient();
      const [requests, memberships] = await Promise.all([
        supabase
          .from("cleaner_join_request_state")
          .select("company_id, company_name, join_request_state")
          .eq("company_id", companyId),
        supabase
          .from("cleaner_pool_memberships")
          .select("company_id, company_name, status")
          .eq("company_id", companyId),
      ]);
      if (requests.error || memberships.error) return "error" as const;
      return parseVisitorRelationship(
        requests.data,
        memberships.data,
        companyId,
      ) ?? "error";
    }

    void loadRelationship().then((result) => {
      if (active) setRelationship(result);
    });

    return () => {
      active = false;
    };
  }, [account, posting]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const screen: Screen = !code
    ? { status: "no-code" }
    : posting === null
      ? { status: "loading" }
      : posting.state === "active"
        ? { status: "ready", posting, code }
        : posting.closingReason === "unknown"
          ? { status: "unknown" }
          : { status: "inactive" };

  async function completeApplication(
    details: CleanerDetails,
    note: string,
    savedLocale?: string | null,
  ) {
    const supabase = getSupabaseClient();
    const { error: applicationError } = await supabase.rpc("apply_to_posting", {
      posting_code: code,
      full_name: details.fullName,
      phone: details.phone,
      suburb: details.suburb,
      ...(note ? { note } : {}),
    });
    if (applicationError) {
      if (applicationError.message === "Posting is no longer active") {
        setPosting({ closingReason: "closed_during_application", state: "dead" });
      } else if (applicationError.message === "This company rejected your join request") {
        setRelationship("rejected");
      } else if (applicationError.message === "This company removed you from its cleaner staff") {
        setRelationship("removed");
      } else if (applicationError.message === "Person can apply only once per posting") {
        setSubmitted(true);
      } else {
        setError(joinFailureKey(applicationError.message));
      }
      setPending(false);
      return;
    }

    markPushPromptAfterJoin();
    const explicitLocale = localeFromCookieString(document.cookie);
    const targetLocale = explicitLocale ?? (isAppLocale(savedLocale) ? savedLocale : locale);
    // The join is already committed. A transient preference failure must not strand the
    // cleaner on an invitation she has successfully accepted.
    await supabase.rpc("set_preferred_locale", { target_locale: targetLocale });
    persistLocaleCookie(targetLocale);
    if (relationship !== "staff") setRelationship("waiting");
    setSubmitted(true);
    setPending(false);
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
      note: String(formData.get("note") ?? ""),
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

    await completeApplication(parsed.data, parsed.data.note, locale);
  }

  async function continueWithGoogle() {
    setPending(true);
    setError(null);
    const next = `${localePath(locale, "/join")}?code=${encodeURIComponent(code)}`;
    const callback = new URL(localePath(locale, "/callback"), window.location.origin);
    callback.searchParams.set("next", next);
    const { error: oauthError } = await getSupabaseClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (oauthError) {
      setError("googleSignInError");
      setPending(false);
    }
  }

  async function joinExistingAccount(formData: FormData) {
    setPending(true);
    setError(null);

    const parsed = applicationKeySchema.safeParse({
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      suburb: String(formData.get("suburb") ?? ""),
      note: String(formData.get("note") ?? ""),
    });
    if (!parsed.success) {
      const key = parsed.error.issues[0]?.message;
      setError(isJoinValidationKey(key) ? key : "checkDetails");
      setPending(false);
      return;
    }

    await completeApplication(parsed.data, parsed.data.note, account.status === "authenticated"
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
    setRelationship("loading");
    setSubmitted(false);
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

  if (screen.status === "no-code" || screen.status === "unknown" || screen.status === "inactive") {
    return (
      <>
        <div className="auth-toolbar">
          <LanguageSwitcher
            authenticated={account.status === "authenticated"}
            compact
            disabled={pending || !hydrated}
          />
        </div>
        <h1 className="screen-title">
          {screen.status === "inactive" ? t("inactiveTitle") : t("cannotOpenTitle")}
        </h1>
        <div className="invite-problem" role="alert">
          <p>
            {screen.status === "no-code"
              ? t("missingCode")
              : screen.status === "inactive"
                ? t("inactiveBody")
                : t("inviteUnknown")}
          </p>
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
      <PostingCard posting={screen.posting} />
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

      {account.status === "anonymous" && !submitted ? (
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
          {inAppBrowser ? (
            <div className="webview-guidance" role="note">
              <strong>{t("googleBlockedTitle")}</strong>
              <p>{t("googleBlockedBody")}</p>
            </div>
          ) : (
            <button
              className="button button--secondary"
              disabled={pending || !hydrated}
              onClick={() => void continueWithGoogle()}
              type="button"
            >
              {t("continueWithGoogle")}
            </button>
          )}
          <div className="auth-divider" role="separator">
            <span>{t("emailAccountDivider")}</span>
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
            <NoteField />
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
              {pending
                ? t("sending")
                : screen.posting.intent === "expression_of_interest"
                  ? t("sendRequest")
                  : t("applyForJob")}
            </button>
            <p className="consent-caption">
              {t("newAccountConsent")}
            </p>
          </form>
        </>
      ) : null}

      {account.status === "authenticated" && relationship === "loading" ? (
        <p className="screen-lead" role="status">{t("checkingRequest")}</p>
      ) : null}

      {account.status === "authenticated" && relationship === "error" ? (
        <div className="invite-problem" role="alert">
          <p>{t("requestCheckError")}</p>
          <button
            className="button button--secondary"
            onClick={() => setAccountAttempt((attempt) => attempt + 1)}
            type="button"
          >
            {commonT("retry")}
          </button>
        </div>
      ) : null}

      {account.status === "authenticated" && relationship !== "loading" && relationship !== "error" && !submitted ? (
        <RelationshipNotice relationship={relationship} />
      ) : null}

      {submitted ? (
        <div className="request-state request-state--success" role="status">
          <h2>{screen.posting.intent === "expression_of_interest" ? t("requestSentTitle") : t("applicationSentTitle")}</h2>
          <p>{screen.posting.intent === "expression_of_interest" ? t("requestSentBody") : t("applicationSentBody")}</p>
        </div>
      ) : null}

      {account.status === "authenticated"
        && relationship !== "loading"
        && relationship !== "error"
        && relationship !== "rejected"
        && relationship !== "removed"
        && !submitted
        && !(screen.posting.intent === "expression_of_interest" && relationship !== "none")
        && !(screen.posting.intent === "regular" && relationship === "staff") ? (
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
          {relationship === "none" ? <NoteField /> : null}
          {error ? (
            <div className="form-error" ref={errorRef} role="alert" tabIndex={-1}>
              <p>{t(error)}</p>
            </div>
          ) : null}
          <button className="button" disabled={pending || !hydrated} type="submit">
            {pending
              ? t("sending")
              : screen.posting.intent === "expression_of_interest"
                ? t("sendRequest")
                : t("applyForJob")}
          </button>
          <p className="consent-caption">
            {t("existingAccountConsent")}
          </p>
        </form>
      ) : null}
    </>
  );
}

function RelationshipNotice({ relationship }: Readonly<{ relationship: VisitorRelationship }>) {
  const t = useTranslations("Join");
  if (relationship === "none") return null;

  let body: string;
  let title: string;
  switch (relationship) {
    case "waiting":
      title = t("requestWaitingTitle");
      body = t("requestWaitingBody");
      break;
    case "admitted":
    case "staff":
      title = t("alreadyStaffTitle");
      body = t("alreadyStaffBody");
      break;
    case "rejected":
      title = t("requestClosedTitle");
      body = t("requestClosedBody");
      break;
    case "removed":
      title = t("accessClosedTitle");
      body = t("accessClosedBody");
      break;
  }

  return (
    <div className="request-state">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function NoteField() {
  const t = useTranslations("Join");
  return (
    <div className="field">
      <label htmlFor="note">{t("note")}</label>
      <textarea id="note" maxLength={1000} name="note" rows={4} />
      <p className="field-hint">{t("noteHint")}</p>
    </div>
  );
}

function PostingCard({ posting }: Readonly<{ posting: ActivePosting }>) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Join");
  const servicesT = useTranslations("Services");

  let title: string;
  let schedule: string | null = null;
  let service: string | null = null;
  let pay: string | null = null;

  switch (posting.intent) {
    case "expression_of_interest":
      title = t("expressionTitle", { company: posting.companyName });
      break;
    case "one_time":
      title = t("oneTimeTitle");
      schedule = t("oneTimeSchedule", {
        date: formatJobDate(posting.scheduledStart, locale),
        duration: formatJobDuration(posting.durationMinutes, locale),
        time: formatJobTime(posting.scheduledStart, locale),
      });
      service = getServiceLabel(
        { name: posting.serviceName, slug: posting.serviceSlug },
        servicesT,
      );
      pay = formatCleanerPay(posting.cleanerPayCents, locale);
      break;
    case "regular":
      title = t("regularTitle");
      schedule = t(posting.frequency === "weekly" ? "weeklySchedule" : "fortnightlySchedule", {
        duration: formatJobDuration(posting.durationMinutes, locale),
        time: formatSeriesTime(posting.localStartTime, locale),
        weekday: formatSeriesWeekday(posting.weekday, locale),
      });
      service = getServiceLabel(
        { name: posting.serviceName, slug: posting.serviceSlug },
        servicesT,
      );
      pay = formatCleanerPay(posting.cleanerPayCents, locale);
      break;
  }

  return (
    <article className="posting-card">
      <div className="posting-card__heading">
        <p className="posting-card__company">{posting.companyName}</p>
        <h1 className="screen-title">{title}</h1>
      </div>
      {service && schedule && pay && posting.intent !== "expression_of_interest" ? (
        <dl className="posting-card__facts">
          <div>
            <dt>{t("serviceLabel")}</dt>
            <dd>{service}</dd>
          </div>
          <div>
            <dt>{t("scheduleLabel")}</dt>
            <dd>{schedule}</dd>
          </div>
          <div>
            <dt>{t("suburbLabel")}</dt>
            <dd>{posting.suburb}</dd>
          </div>
          <div>
            <dt>{t("payLabel")}</dt>
            <dd>{pay}</dd>
          </div>
        </dl>
      ) : null}
      <p className="posting-card__description">{posting.publicDescription}</p>
    </article>
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
