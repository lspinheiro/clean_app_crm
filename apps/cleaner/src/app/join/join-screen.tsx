"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  describeInviteProblem,
  describeJoinFailure,
  describeCleanerCount,
  isInviteState,
  normaliseInviteCode,
  type InvitePreview,
} from "@/features/join/invite";
import { cleanerDetailsSchema, registrationSchema } from "@/features/join/schema";
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
      email: string;
      profile: { full_name: string; phone: string | null; suburb: string | null };
    };

type CleanerDetails = {
  fullName: string;
  phone: string;
  suburb: string;
};

export function JoinScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = normaliseInviteCode(searchParams.get("code") ?? "");

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [account, setAccount] = useState<AccountState>({ status: "loading" });
  const [accountAttempt, setAccountAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [signUpAccountExists, setSignUpAccountExists] = useState(false);
  const [pending, setPending] = useState(false);
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
        .select("full_name, phone, suburb")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profileError || !profile) return { status: "error" };

      return {
        status: "authenticated",
        email: data.user.email ?? "Signed-in account",
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

  async function completeJoin(details: CleanerDetails) {
    const { error: joinError } = await getSupabaseClient().rpc("join_company_pool", {
      invite_code: code,
      full_name: details.fullName,
      phone: details.phone,
      suburb: details.suburb,
    });
    if (joinError) {
      setError(describeJoinFailure(joinError.message));
      setPending(false);
      return;
    }

    router.replace("/board");
  }

  async function registerAndJoin(formData: FormData) {
    setPending(true);
    setError(null);
    setSignUpAccountExists(false);

    const parsed = registrationSchema.safeParse({
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      suburb: String(formData.get("suburb") ?? ""),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details.");
      setPending(false);
      return;
    }

    const { data, error: signUpError } = await getSupabaseClient().auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { full_name: parsed.data.fullName } },
    });

    if (signUpError) {
      const accountExists =
        signUpError.code === "user_already_exists" || signUpError.status === 422;
      setSignUpAccountExists(accountExists);
      setError(
        accountExists
          ? "An account already uses this email. Sign in with your existing password to join."
          : "We could not create your account. Check your details and try again.",
      );
      setPending(false);
      return;
    }
    if (!data.session) {
      setError("Check your email to confirm your account, then open this invitation again.");
      setPending(false);
      return;
    }

    await completeJoin(parsed.data);
  }

  async function joinExistingAccount(formData: FormData) {
    setPending(true);
    setError(null);

    const parsed = cleanerDetailsSchema.safeParse({
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      suburb: String(formData.get("suburb") ?? ""),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details.");
      setPending(false);
      return;
    }

    await completeJoin(parsed.data);
  }

  async function switchAccount() {
    setPending(true);
    setError(null);
    const { error: signOutError } = await getSupabaseClient().auth.signOut({ scope: "local" });
    if (signOutError) {
      setError("We could not sign you out. Try again.");
      setPending(false);
      return;
    }

    setAccount({ status: "anonymous" });
    setPending(false);
  }

  if (screen.status === "loading") {
    return <p className="screen-lead">Loading invitation…</p>;
  }

  if (screen.status === "no-code" || screen.status === "problem") {
    const message =
      screen.status === "no-code"
        ? "This invite link is missing its code. Ask the company to send the link again."
        : describeInviteProblem(screen.invite);

    return (
      <>
        <h1 className="screen-title">We cannot open this invite</h1>
        <div className="invite-problem" role="alert">
          <p>{message}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        <h1 className="screen-title">Join this company</h1>
        <p className="screen-lead">It takes about a minute. Then you can see their open jobs.</p>
      </div>
      <div className="invite-card">
        <span className="invite-card__company">{screen.invite.companyName}</span>
        <span className="invite-card__cleaners">
          {describeCleanerCount(screen.invite.cleanerCount)}
        </span>
      </div>
      {account.status === "loading" ? (
        <p className="screen-lead" role="status">
          Checking your account…
        </p>
      ) : null}

      {account.status === "error" ? (
        <div className="invite-problem" role="alert">
          <p>We could not check your account. Check your connection and try again.</p>
          <button
            className="button button--secondary"
            onClick={() => {
              setAccount({ status: "loading" });
              setAccountAttempt((attempt) => attempt + 1);
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {account.status === "anonymous" ? (
        <>
          <div className="auth-choice">
            <p>Already have an account?</p>
            <Link
              className="button button--secondary"
              href={`/login?code=${encodeURIComponent(screen.code)}`}
            >
              Sign in to join
            </Link>
          </div>
          <div className="auth-divider" role="separator">
            <span>or create an account</span>
          </div>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void registerAndJoin(new FormData(event.currentTarget));
            }}
          >
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
              <p className="field-hint">Use at least 8 characters.</p>
            </div>
            <CleanerDetailsFields />
            {error ? (
              <div className="form-error" ref={errorRef} role="alert" tabIndex={-1}>
                <p>{error}</p>
                {signUpAccountExists ? (
                  <Link
                    className="form-error__action"
                    href={`/login?code=${encodeURIComponent(screen.code)}`}
                  >
                    Sign in to join
                  </Link>
                ) : null}
              </div>
            ) : null}
            <button className="button" disabled={pending} type="submit">
              {pending ? "Joining…" : "Join the pool"}
            </button>
            <p className="consent-caption">
              The company sees your name, phone, and suburb so they can offer you work. They do
              not see your password.
            </p>
          </form>
        </>
      ) : null}

      {account.status === "authenticated" ? (
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void joinExistingAccount(new FormData(event.currentTarget));
          }}
        >
          <div className="auth-account">
            <div className="auth-account__identity">
              <span>Signed in as</span>
              <strong>{account.email}</strong>
            </div>
            <button
              className="text-action"
              disabled={pending}
              onClick={() => void switchAccount()}
              type="button"
            >
              Use another account
            </button>
          </div>
          <CleanerDetailsFields
            fullName={account.profile.full_name}
            phone={account.profile.phone ?? ""}
            suburb={account.profile.suburb ?? ""}
          />
          {error ? (
            <div className="form-error" ref={errorRef} role="alert" tabIndex={-1}>
              <p>{error}</p>
            </div>
          ) : null}
          <button className="button" disabled={pending} type="submit">
            {pending ? "Joining…" : "Join the pool"}
          </button>
          <p className="consent-caption">
            The company sees your name, phone, and suburb so they can offer you work.
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
  return (
    <>
      <div className="field">
        <label htmlFor="fullName">Full name</label>
        <input
          defaultValue={fullName}
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="phone">Phone</label>
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
        <label htmlFor="suburb">Suburb</label>
        <input
          defaultValue={suburb}
          id="suburb"
          name="suburb"
          autoComplete="address-level2"
          required
        />
        <p className="field-hint">The suburb you travel from. It helps you find jobs near you.</p>
      </div>
    </>
  );
}
