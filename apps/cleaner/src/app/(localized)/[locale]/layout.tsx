import "../../globals.css";

import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { defaultLocale, isAppLocale, locales, type AppLocale } from "@/i18n/config";
import { DocumentMetadata } from "@/i18n/document-metadata";
import { messagesByLocale } from "@/i18n/messages";
import { CleanerIntlProvider } from "@/i18n/provider";

import { cleanerLabels, cleanerSans } from "../../fonts";

type LocaleLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

const directionContract = `<!--
THESIS: A work-opportunity ledger that refuses the generic marketplace card stack.
OWN-WORLD: Trust Blue calm utility — slate text, quiet surfaces, docket rows, blue only for action, active place, and live status.
STORY: A cleaner sees applied work first, knows it is not an assignment, compares open jobs by time, duration, and pay, then applies once.
FIRST VIEWPORT: Compact brand header, cleaner identity, edge-to-edge applied band, open count, metric-first work docket, and labelled icon navigation.
FORM: Opportunity ledger, structure 3 of the approved board comparison, seed the-clean-crew-trust-blue-v1.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { locale: candidate } = await params;
  const locale: AppLocale = isAppLocale(candidate) ? candidate : defaultLocale;
  const metadata = messagesByLocale[locale].Metadata;
  return {
    title: { default: metadata.title, template: `%s · ${metadata.title}` },
    description: metadata.description,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F8FAFC",
};

export default async function LocaleRootLayout({ children, params }: LocaleLayoutProps) {
  const { locale: candidate } = await params;
  if (!isAppLocale(candidate)) notFound();

  return (
    <html className={`${cleanerSans.variable} ${cleanerLabels.variable}`} lang={candidate}>
      <body>
        <template
          data-design-contract="the-clean-crew-trust-blue-v1"
          dangerouslySetInnerHTML={{ __html: directionContract }}
        />
        <CleanerIntlProvider initialLocale={candidate}>
          <DocumentMetadata />
          {children}
        </CleanerIntlProvider>
      </body>
    </html>
  );
}
