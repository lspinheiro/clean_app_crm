import { Suspense } from "react";

import { LegacyLocaleRedirect } from "@/components/legacy-locale-redirect";

export default function LegacyBoardPage() {
  return <Suspense><LegacyLocaleRedirect pathname="/board" /></Suspense>;
}
