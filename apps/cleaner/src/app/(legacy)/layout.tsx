import "../globals.css";

import type { Metadata, Viewport } from "next";

import { cleanerLabels, cleanerSans } from "../fonts";

export const metadata: Metadata = {
  title: { default: "The Clean Crew", template: "%s · The Clean Crew" },
  description: "The Clean Crew App — find and run cleaning jobs from the companies you work with.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function LegacyRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`${cleanerSans.variable} ${cleanerLabels.variable}`} lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
