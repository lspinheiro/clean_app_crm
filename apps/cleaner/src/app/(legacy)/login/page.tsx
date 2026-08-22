import { Suspense } from "react";

import { LegacyLocaleRedirect } from "@/components/legacy-locale-redirect";

export default function LegacyLoginPage() {
  return <Suspense><LegacyLocaleRedirect pathname="/login" /></Suspense>;
}
