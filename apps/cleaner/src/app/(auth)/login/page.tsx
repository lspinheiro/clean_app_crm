import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginScreen } from "./login-screen";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="screen">
      <span className="brand-lockup">
        <span aria-hidden="true" className="brand-mark">
          CA
        </span>
        Clean App
      </span>
      <Suspense fallback={<p className="screen-lead">Loading…</p>}>
        <LoginScreen />
      </Suspense>
    </main>
  );
}
