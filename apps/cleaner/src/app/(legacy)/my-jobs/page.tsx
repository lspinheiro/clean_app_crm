import { Suspense } from "react";

import { LegacyLocaleRedirect } from "@/components/legacy-locale-redirect";

export default function LegacyMyJobsPage() {
  return <Suspense><LegacyLocaleRedirect pathname="/my-jobs" /></Suspense>;
}
