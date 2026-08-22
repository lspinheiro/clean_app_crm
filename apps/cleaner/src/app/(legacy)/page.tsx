import { Suspense } from "react";

import { LegacyLocaleRedirect } from "@/components/legacy-locale-redirect";

export default function LegacyHomePage() {
  return (
    <Suspense>
      <LegacyLocaleRedirect pathname="/" />
    </Suspense>
  );
}
