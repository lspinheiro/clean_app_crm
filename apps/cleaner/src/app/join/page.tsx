import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandBubbles } from "../../components/brand-bubbles";
import { JoinScreen } from "./join-screen";

export const metadata: Metadata = { title: "Join a cleaner pool" };

export default function JoinPage() {
  return (
    <main className="screen">
      <span className="brand-lockup">
        <BrandBubbles />
        The Clean Crew
      </span>
      <Suspense fallback={<p className="screen-lead">Loading…</p>}>
        <JoinScreen />
      </Suspense>
    </main>
  );
}
