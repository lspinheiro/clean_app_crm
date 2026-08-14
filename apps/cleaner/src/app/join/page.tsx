import type { Metadata } from "next";
import { Suspense } from "react";

import { JoinScreen } from "./join-screen";

export const metadata: Metadata = { title: "Join a cleaner pool" };

export default function JoinPage() {
  return (
    <main className="screen">
      <span className="brand-lockup">
        <span aria-hidden="true" className="brand-mark">
          CA
        </span>
        Clean App
      </span>
      <Suspense fallback={<p className="screen-lead">Loading…</p>}>
        <JoinScreen />
      </Suspense>
    </main>
  );
}
