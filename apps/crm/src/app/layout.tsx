import "./globals.css";

import type { Metadata } from "next";
import localFont from "next/font/local";

const poppins = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/poppins/files/poppins-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/poppins/files/poppins-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/poppins/files/poppins-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/poppins/files/poppins-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/poppins/files/poppins-latin-800-normal.woff2",
      weight: "800",
      style: "normal",
    },
  ],
  display: "optional",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: { default: "Clean App", template: "%s · Clean App" },
  description: "Company-side cleaning operations CRM.",
};

const directionContract = `<!--
THESIS: A calm operational ledger that refuses the dashboard-card mosaic.
OWN-WORLD: Ink on paper, Poppins weight, flat rules, pill actions, colour only for state.
STORY: A company admin signs in and moves directly through the records that run the week.
FIRST VIEWPORT: Persistent top navigation, one decisive page heading, and the active work surface below.
FORM: Established Clean App Operate system, structure 1, seed clean-app-operate-ledger-v1.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={poppins.variable} lang="en-AU">
      <body>
        <template
          data-design-contract="clean-app-operate-ledger-v1"
          dangerouslySetInnerHTML={{ __html: directionContract }}
        />
        {children}
      </body>
    </html>
  );
}
