import "./globals.css";

import { NotFoundContent } from "@/components/not-found-content";

import { cleanerLabels, cleanerSans } from "./fonts";

const documentLocaleScript = `document.documentElement.lang=/^\\/(?:pt-BR)(?:\\/|$)/.test(location.pathname)?"pt-BR":"en-AU"`;

export default function GlobalNotFound() {
  return (
    <html
      className={`${cleanerSans.variable} ${cleanerLabels.variable}`}
      lang="en-AU"
      suppressHydrationWarning
    >
      <head>
        <title>The Clean Crew</title>
        <script dangerouslySetInnerHTML={{ __html: documentLocaleScript }} />
      </head>
      <body>
        <NotFoundContent />
      </body>
    </html>
  );
}
