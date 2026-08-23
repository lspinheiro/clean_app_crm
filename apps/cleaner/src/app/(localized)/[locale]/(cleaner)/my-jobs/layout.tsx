import type { Metadata } from "next";

import { defaultLocale, isAppLocale } from "@/i18n/config";
import { loadCleanerMessages } from "@/i18n/messages";

type MyJobsLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: MyJobsLayoutProps): Promise<Metadata> {
  const { locale: candidate } = await params;
  const locale = isAppLocale(candidate) ? candidate : defaultLocale;
  return { title: (await loadCleanerMessages(locale)).Metadata.myJobsTitle };
}

export default function MyJobsLayout({ children }: MyJobsLayoutProps) {
  return children;
}
