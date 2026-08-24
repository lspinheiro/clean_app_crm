import type { Metadata } from "next";

import { defaultLocale, isAppLocale } from "@/i18n/config";
import { loadCleanerMessages } from "@/i18n/messages";

type ProfileLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: ProfileLayoutProps): Promise<Metadata> {
  const { locale: candidate } = await params;
  const locale = isAppLocale(candidate) ? candidate : defaultLocale;
  return { title: (await loadCleanerMessages(locale)).Metadata.profileTitle };
}

export default function ProfileLayout({ children }: ProfileLayoutProps) {
  return children;
}
