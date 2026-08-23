"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import type { Database } from "@clean-app/db";

import { joinFailureKey, normaliseInviteCode } from "@/features/join/invite";
import {
  cleanerDetailsKeySchema,
  isJoinValidationKey,
  type JoinValidationKey,
} from "@/features/join/schema";
import type { AppLocale } from "@/i18n/config";
import { localePath } from "@/i18n/config";
import { useCleaner } from "@/lib/auth/use-cleaner";
import { getInstallStatus, promptInstall, subscribeToInstallStatus } from "@/lib/install";
import {
  getPushSubscriptionState,
  subscribeToPush,
  type PushSubscriptionState,
} from "@/lib/push";
import { getSupabaseClient } from "@/lib/supabase/client";

type ProfileDetails = {
  fullName: string;
  phone: string;
  suburb: string;
};

type JoinedCompanyRow = Pick<
  Database["public"]["Views"]["cleaner_pool_memberships"]["Row"],
  "company_id" | "company_name" | "status"
>;

type JoinedCompany = {
  [Key in keyof JoinedCompanyRow]: NonNullable<JoinedCompanyRow[Key]>;
};

type ScreenState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; companies: JoinedCompany[] };

type LoadedProfile = { screen: ScreenState; details?: ProfileDetails };

type FormError = JoinValidationKey | "codeRequired" | "joinError" | "saveError" | "signOutError";

function isJoinedCompany(row: JoinedCompanyRow): row is JoinedCompany {
  return row.company_id !== null && row.company_name !== null && row.status !== null;
}

export default function ProfilePage() {
  const router = useRouter();
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Profile");
  const joinT = useTranslations("Join");
  const commonT = useTranslations("Common");
  const cleaner = useCleaner();
  const [screen, setScreen] = useState<ScreenState>({ status: "loading" });
  const [details, setDetails] = useState<ProfileDetails>({ fullName: "", phone: "", suburb: "" });
  const [error, setError] = useState<FormError | null>(null);
  const [joinFailure, setJoinFailure] = useState<ReturnType<typeof joinFailureKey> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [installStatus, setInstallStatus] = useState(() => getInstallStatus());
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState(false);
  const [pushState, setPushState] = useState<PushSubscriptionState | "checking">("checking");
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushError, setPushError] = useState(false);

  const readCompanies = useCallback(async () => {
    const { data, error: companiesError } = await getSupabaseClient()
      .from("cleaner_pool_memberships")
      .select("company_id, company_name, status")
      .order("company_name");
    if (companiesError) return null;
    return (data ?? []).filter(isJoinedCompany);
  }, []);

  const load = useCallback(async (cleanerId: string): Promise<LoadedProfile> => {
    const supabase = getSupabaseClient();
    const [profileResult, companies] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, phone, suburb")
        .eq("id", cleanerId)
        .maybeSingle(),
      readCompanies(),
    ]);

    if (profileResult.error || !profileResult.data || companies === null) {
      return { screen: { status: "error" } };
    }

    return {
      details: {
        fullName: profileResult.data.full_name,
        phone: profileResult.data.phone ?? "",
        suburb: profileResult.data.suburb ?? "",
      },
      screen: { status: "ready", companies },
    };
  }, [readCompanies]);

  useEffect(() => {
    if (cleaner.status !== "allowed") return;
    let active = true;
    void load(cleaner.profile.id).then((loaded) => {
      if (!active) return;
      if (loaded.details) setDetails(loaded.details);
      setScreen(loaded.screen);
    });
    return () => {
      active = false;
    };
  }, [cleaner, load]);

  useEffect(() => subscribeToInstallStatus(setInstallStatus), []);

  useEffect(() => {
    void getPushSubscriptionState().then(setPushState);
  }, []);

  function validateDetails(): ProfileDetails | null {
    const parsed = cleanerDetailsKeySchema.safeParse(details);
    if (parsed.success) return parsed.data;
    const key = parsed.error.issues[0]?.message;
    setError(isJoinValidationKey(key) ? key : "saveError");
    return null;
  }

  async function saveProfile() {
    setError(null);
    setJoinFailure(null);
    setNotice(null);
    const valid = validateDetails();
    if (!valid) return;

    setSaving(true);
    const { error: saveError } = await getSupabaseClient().rpc("update_cleaner_profile", {
      full_name: valid.fullName,
      phone: valid.phone,
      suburb: valid.suburb,
    });
    setSaving(false);
    if (saveError) {
      setError("saveError");
      return;
    }

    setDetails(valid);
    setNotice(t("profileSaved"));
  }

  async function joinCompany(rawCode: string) {
    setError(null);
    setJoinFailure(null);
    setNotice(null);
    const inviteCode = normaliseInviteCode(rawCode);
    if (!inviteCode) {
      setError("codeRequired");
      return;
    }
    const valid = validateDetails();
    if (!valid) return;
    const existingCompanies = screen.status === "ready" ? screen.companies : [];

    setJoining(true);
    const { data, error: joinError } = await getSupabaseClient().rpc("join_company_pool", {
      invite_code: inviteCode,
      full_name: valid.fullName,
      phone: valid.phone,
      suburb: valid.suburb,
    });
    if (joinError) {
      setJoining(false);
      setJoinFailure(joinFailureKey(joinError.message));
      return;
    }

    const joinedCompany = data?.[0];
    const alreadyMember = joinedCompany
      ? existingCompanies.some(
          (company) => company.company_id === joinedCompany.joined_company_id
            && company.status === "active",
        )
      : false;
    if (alreadyMember) {
      setJoining(false);
      setDetails(valid);
      setNotice(t("alreadyMember", { company: joinedCompany.joined_company_name }));
      return;
    }

    const companies = await readCompanies();
    setJoining(false);
    if (companies === null) {
      setError("joinError");
      return;
    }

    const joined = joinedCompany?.joined_company_name;
    setScreen({ status: "ready", companies });
    setDetails(valid);
    setNotice(joined ? t("joinedCompany", { company: joined }) : t("joinedCompanyFallback"));
  }

  async function installApp() {
    setInstalling(true);
    setInstallError(false);
    const outcome = await promptInstall();
    setInstalling(false);
    setInstallStatus(getInstallStatus());
    setInstallError(outcome === "unavailable");
  }

  async function enablePush() {
    setEnablingPush(true);
    setPushError(false);
    const subscribed = await subscribeToPush();
    setEnablingPush(false);
    setPushState(subscribed ? "subscribed" : "unsubscribed");
    setPushError(!subscribed);
  }

  async function signOut() {
    setSigningOut(true);
    setError(null);
    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut();
      if (!signOutError) {
        router.replace(localePath(locale, "/login"));
        return;
      }
    } catch {
      // A transport exception and a returned AuthError have the same recovery here.
    }
    setSigningOut(false);
    setError("signOutError");
  }

  if (cleaner.status !== "allowed" || screen.status === "loading") {
    return (
      <main className="screen">
        <p role="status">{t("loading")}</p>
      </main>
    );
  }

  if (screen.status === "error") {
    return (
      <main className="screen">
        <div className="empty-state empty-state--error">
          <p className="empty-state__title">{t("loadError")}</p>
          <button
            className="button button--secondary button--small"
            onClick={() => {
              setScreen({ status: "loading" });
              void load(cleaner.profile.id).then((loaded) => {
                if (loaded.details) setDetails(loaded.details);
                setScreen(loaded.screen);
              });
            }}
            type="button"
          >
            {commonT("retry")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen profile-screen">
      <header className="screen-heading">
        <h1 className="screen-title">{t("title")}</h1>
        <p className="screen-lead">{t("lead")}</p>
      </header>

      {notice ? <p className="profile-notice" role="status">{notice}</p> : null}
      {error || joinFailure ? (
        <p className="form-error" role="alert">
          {joinFailure
            ? joinT(joinFailure)
            : error && isJoinValidationKey(error)
              ? joinT(error)
              : t(error ?? "saveError")}
        </p>
      ) : null}

      <section className="profile-panel" aria-labelledby="profile-details-title">
        <h2 className="profile-panel__title" id="profile-details-title">{t("detailsTitle")}</h2>
        <form
          className="form-stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void saveProfile();
          }}
        >
          <div className="field">
            <label htmlFor="profile-full-name">{joinT("fullName")}</label>
            <input
              id="profile-full-name"
              autoComplete="name"
              value={details.fullName}
              onChange={(event) => setDetails((current) => ({ ...current, fullName: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="profile-phone">{joinT("phone")}</label>
            <input
              id="profile-phone"
              type="tel"
              autoComplete="tel"
              value={details.phone}
              onChange={(event) => setDetails((current) => ({ ...current, phone: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="profile-suburb">{joinT("suburb")}</label>
            <input
              id="profile-suburb"
              autoComplete="address-level2"
              value={details.suburb}
              onChange={(event) => setDetails((current) => ({ ...current, suburb: event.target.value }))}
            />
          </div>
          <button className="button" disabled={saving || joining} type="submit">
            {saving ? t("savingProfile") : t("saveProfile")}
          </button>
        </form>
      </section>

      <section className="profile-panel" aria-labelledby="joined-companies-title">
        <h2 className="profile-panel__title" id="joined-companies-title">{t("joinedCompanies")}</h2>
        <ul className="company-list">
          {screen.companies.map((company) => (
            <li className="company-list__item" key={company.company_id}>
              <span>{company.company_name}</span>
              <span className={`status-chip status-chip--${company.status}`}>
                {t(company.status === "active" ? "membershipActive" : "membershipRemoved")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="profile-panel" aria-labelledby="join-company-title">
        <h2 className="profile-panel__title" id="join-company-title">{t("joinTitle")}</h2>
        <p className="profile-panel__body">{t("joinLead")}</p>
        <form
          className="form-stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void joinCompany(String(form.get("inviteCode") ?? ""));
          }}
        >
          <div className="field">
            <label htmlFor="invite-code">{t("inviteCode")}</label>
            <input id="invite-code" name="inviteCode" autoCapitalize="characters" autoComplete="off" />
          </div>
          <button className="button button--secondary" disabled={joining || saving} type="submit">
            {joining ? t("joiningCompany") : t("joinCompany")}
          </button>
        </form>
      </section>

      <section className="profile-panel" aria-labelledby="app-upgrades-title">
        <h2 className="profile-panel__title" id="app-upgrades-title">{t("appTitle")}</h2>
        <div className="profile-setting">
          <div>
            <h3>{t("installTitle")}</h3>
            <p>
              {t(installStatus === "installed"
                ? "installInstalled"
                : installStatus === "available"
                  ? "installAvailable"
                  : "installUnavailable")}
            </p>
          </div>
          {installStatus === "available" ? (
            <button
              className="button button--secondary button--small"
              disabled={installing}
              onClick={() => void installApp()}
              type="button"
            >
              {installing ? t("installing") : t("installApp")}
            </button>
          ) : null}
          {installError ? <p className="field-error" role="alert">{t("installError")}</p> : null}
        </div>
        <div className="profile-setting">
          <div>
            <h3>{t("notificationsTitle")}</h3>
            <p>
              {t(pushState === "subscribed"
                ? "notificationsOn"
                : pushState === "unsupported"
                  ? "notificationsUnavailable"
                  : pushState === "checking"
                    ? "notificationsChecking"
                    : "notificationsOff")}
            </p>
          </div>
          {pushState === "unsubscribed" ? (
            <button
              className="button button--secondary button--small"
              disabled={enablingPush}
              onClick={() => void enablePush()}
              type="button"
            >
              {enablingPush ? t("enablingNotifications") : t("enableNotifications")}
            </button>
          ) : null}
          {pushError ? <p className="field-error" role="alert">{t("notificationsError")}</p> : null}
        </div>
      </section>

      <button
        className="button button--secondary"
        disabled={signingOut}
        onClick={() => void signOut()}
        type="button"
      >
        {signingOut ? commonT("signingOut") : commonT("signOut")}
      </button>
    </main>
  );
}
