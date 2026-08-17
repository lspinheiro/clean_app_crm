import "./globals.css";

import type { Metadata } from "next";
import localFont from "next/font/local";

const inter = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-800-normal.woff2",
      weight: "800",
      style: "normal",
    },
  ],
  display: "optional",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--font-inter",
});

const publicSans = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/public-sans/files/public-sans-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/public-sans/files/public-sans-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  display: "optional",
  fallback: ["Arial", "sans-serif"],
  preload: false,
  variable: "--font-public-sans",
});

export const metadata: Metadata = {
  title: { default: "The Clean Crew", template: "%s · The Clean Crew" },
  description: "The Clean Crew CRM — company-side cleaning operations.",
};

const directionContract = `<!--
THESIS: A calm operational ledger that refuses the dashboard-card mosaic.
OWN-WORLD: Trust Blue calm utility — slate text on quiet surfaces, Inter voice, blue only for the primary action, the active place, and now.
STORY: A company admin signs in and moves directly through the records that run the week.
FIRST VIEWPORT: Persistent top navigation, one decisive page heading, and the active work surface below.
FORM: Established The Clean Crew Trust Blue system, structure 1, seed clean-app-trust-blue-v1.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`${inter.variable} ${publicSans.variable}`} lang="en-AU">
      <body>
        <template
          data-design-contract="clean-app-trust-blue-v1"
          dangerouslySetInnerHTML={{ __html: directionContract }}
        />
        {children}
      </body>
    </html>
  );
}
