"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { normaliseInviteCode } from "@/features/join/invite";
import { evaluateCleanerAccess } from "@/lib/auth/access";
import { getSupabaseClient } from "@/lib/supabase/client";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const inviteCode = normaliseInviteCode(searchParams.get("code") ?? "");
  const notAuthorised = searchParams.get("error") === "not-authorised";

  async function signIn(formData: FormData) {
    setPending(true);
    setError(null);

    const parsed = loginSchema.safeParse({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details.");
      setPending(false);
      return;
    }

    const supabase = getSupabaseClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword(parsed.data);
    if (signInError || !data.user) {
      setError("Email or password is incorrect.");
      setPending(false);
      return;
    }

    if (inviteCode) {
      router.replace(`/join?code=${encodeURIComponent(inviteCode)}`);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();

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
      setError("This app is for cleaners. Company admins use the CRM.");
      setPending(false);
      return;
    }

    router.replace("/board");
  }

  return (
    <>
      <div>
        <h1 className="screen-title">Sign in</h1>
        <p className="screen-lead">
          {inviteCode
            ? "Use your existing account. We will return you to this invitation."
            : "Use the email and password you signed up with."}
        </p>
      </div>
      {notAuthorised && !inviteCode ? (
        <p className="form-error" role="alert">
          Sign in to see your jobs. This app is for cleaners.
        </p>
      ) : null}
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void signIn(new FormData(event.currentTarget));
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
            autoComplete="current-password"
            required
          />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button" disabled={pending} type="submit">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}
