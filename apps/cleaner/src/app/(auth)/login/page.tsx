import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="screen">
      <span className="brand-lockup">
        <span aria-hidden="true" className="brand-mark">
          CA
        </span>
        Clean App
      </span>
      <div>
        <h1 className="screen-title">Sign in</h1>
        <p className="screen-lead">Use the email and password you signed up with.</p>
      </div>
      {error === "not-authorised" ? (
        <p className="form-error" role="alert">
          Sign in to see your jobs. This app is for cleaners.
        </p>
      ) : null}
      <LoginForm />
    </main>
  );
}
