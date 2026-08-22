import { Suspense } from "react";

import { LegacyLocaleRedirect } from "@/components/legacy-locale-redirect";

export default function LegacyJoinPage() {
  return <Suspense><LegacyLocaleRedirect pathname="/join" /></Suspense>;
}
