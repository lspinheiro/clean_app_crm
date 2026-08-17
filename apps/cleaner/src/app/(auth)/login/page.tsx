import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandBubbles } from "../../../components/brand-bubbles";
import { LoginScreen } from "./login-screen";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="screen">
      <span className="brand-lockup">
        <BrandBubbles />
        The Clean Crew
      </span>
      <Suspense fallback={<p className="screen-lead">Loading…</p>}>
        <LoginScreen />
      </Suspense>
    </main>
  );
}
