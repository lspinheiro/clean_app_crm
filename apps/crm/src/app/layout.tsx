import "./globals.css";

import type { Metadata } from "next";
import localFont from "next/font/local";
import { getLocale, getTranslations } from "next-intl/server";

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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return {
    title: { default: "The Clean Crew", template: "%s · The Clean Crew" },
    description: t("description"),
  };
}

const directionContract = `<!--
THESIS: A calm operational ledger that refuses the dashboard-card mosaic.
OWN-WORLD: Trust Blue calm utility — slate text on quiet surfaces, Inter voice, blue only for the primary action, the active place, and now.
STORY: A company admin signs in and moves directly through the records that run the week.
FIRST VIEWPORT: Persistent top navigation, one decisive page heading, and the active work surface below.
FORM: Established The Clean Crew Trust Blue system, structure 1, seed the-clean-crew-trust-blue-v1.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html className={`${inter.variable} ${publicSans.variable}`} lang={locale}>
      <body>
        <template
          data-design-contract="the-clean-crew-trust-blue-v1"
          dangerouslySetInnerHTML={{ __html: directionContract }}
        />
        {children}
      </body>
    </html>
  );
}
