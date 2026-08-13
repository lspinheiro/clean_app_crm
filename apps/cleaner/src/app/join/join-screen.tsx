"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  describeInviteProblem,
  describeJoinFailure,
  describePoolSize,
  isInviteState,
  normaliseInviteCode,
  type InvitePreview,
} from "@/features/join/invite";
import { registrationSchema } from "@/features/join/schema";
import { getSupabaseClient } from "@/lib/supabase/client";

const unknownInvite: InvitePreview = { state: "unknown", companyName: null, poolSize: 0 };

type Screen =
  | { status: "loading" }
  | { status: "no-code" }
  | { status: "problem"; invite: InvitePreview }
  | { status: "ready"; invite: InvitePreview; code: string };

export function JoinScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = normaliseInviteCode(searchParams.get("code") ?? "");

  // Only the fetched invite lives in state; every screen below is derived from it.
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
        poolSize: row.pool_size,
      };
    }

    void loadInvite().then((result) => {
      if (active) setInvite(result);
    });

    return () => {
      active = false;
    };
  }, [code]);

  const screen: Screen = !code
    ? { status: "no-code" }
    : invite === null
      ? { status: "loading" }
      : invite.state === "active"
        ? { status: "ready", invite, code }
        : { status: "problem", invite };

  async function join(formData: FormData) {
    setPending(true);
    setError(null);

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

    const supabase = getSupabaseClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { full_name: parsed.data.fullName } },
    });

    if (signUpError) {
      setError(
        "We could not create your account. Check your email address, or sign in if you already have one.",
      );
      setPending(false);
      return;
    }
    if (!data.session) {
      setError("Check your email to confirm your account, then open this link again.");
      setPending(false);
      return;
    }

    const { error: joinError } = await supabase.rpc("join_company_pool", {
      invite_code: code,
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      suburb: parsed.data.suburb,
    });
    if (joinError) {
      setError(describeJoinFailure(joinError.message));
      setPending(false);
      return;
    }

    router.replace("/board");
  }

  if (screen.status === "loading") {
    return <p className="screen-lead">Loading…</p>;
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
        <h1 className="screen-title">Join the cleaner pool</h1>
        <p className="screen-lead">It takes about a minute. Then you can see their open jobs.</p>
      </div>
      <div className="invite-card">
        <span className="invite-card__company">{screen.invite.companyName}</span>
        <span className="invite-card__pool">{describePoolSize(screen.invite.poolSize)}</span>
      </div>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void join(new FormData(event.currentTarget));
        }}
      >
        <div className="field">
          <label htmlFor="fullName">Full name</label>
          <input id="fullName" name="fullName" autoComplete="name" required />
        </div>
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
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" required />
        </div>
        <div className="field">
          <label htmlFor="suburb">Suburb</label>
          <input id="suburb" name="suburb" autoComplete="address-level2" required />
          <p className="field-hint">
            The suburb you travel from. It helps you find jobs near you.
          </p>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
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
  );
}
