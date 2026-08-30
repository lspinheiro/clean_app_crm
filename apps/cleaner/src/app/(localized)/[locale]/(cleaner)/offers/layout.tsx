import type { Metadata } from "next";

import { defaultLocale, isAppLocale } from "@/i18n/config";
import { loadCleanerMessages } from "@/i18n/messages";

type OffersLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: OffersLayoutProps): Promise<Metadata> {
  const { locale: candidate } = await params;
  const locale = isAppLocale(candidate) ? candidate : defaultLocale;
  return { title: (await loadCleanerMessages(locale)).Metadata.offersTitle };
}

export default function OffersLayout({ children }: OffersLayoutProps) {
  return children;
}
