import "./globals.css";

import { NotFoundContent } from "@/components/not-found-content";
import { documentLocaleBootstrapScript } from "@/i18n/document-locale-script";

import { cleanerLabels, cleanerSans } from "./fonts";

export default function GlobalNotFound() {
  return (
    <html
      className={`${cleanerSans.variable} ${cleanerLabels.variable}`}
      lang="en-AU"
      suppressHydrationWarning
    >
      <head>
        <title>The Clean Crew</title>
        <script dangerouslySetInnerHTML={{ __html: documentLocaleBootstrapScript() }} />
      </head>
      <body>
        <NotFoundContent />
      </body>
    </html>
  );
}
