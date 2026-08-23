import "../../globals.css";

import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { defaultLocale, isAppLocale, locales, type AppLocale } from "@/i18n/config";
import { DocumentMetadata } from "@/i18n/document-metadata";
import { loadCleanerMessages } from "@/i18n/messages";
import { CleanerIntlProvider } from "@/i18n/provider";

import { cleanerLabels, cleanerSans } from "../../fonts";

type LocaleLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { locale: candidate } = await params;
  const locale: AppLocale = isAppLocale(candidate) ? candidate : defaultLocale;
  const metadata = (await loadCleanerMessages(locale)).Metadata;
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
  const messages = await loadCleanerMessages(candidate);

  return (
    <html className={`${cleanerSans.variable} ${cleanerLabels.variable}`} lang={candidate}>
      <body>
        <CleanerIntlProvider initialLocale={candidate} initialMessages={messages}>
          <DocumentMetadata />
          {children}
        </CleanerIntlProvider>
      </body>
    </html>
  );
}
