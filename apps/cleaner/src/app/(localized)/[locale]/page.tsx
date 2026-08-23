"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BrandBubbles } from "@/components/brand-bubbles";
import { localePath } from "@/i18n/config";
import { useCleanerLocale } from "@/i18n/provider";

export default function LocalisedHomePage() {
  const router = useRouter();
  const { locale } = useCleanerLocale();

  useEffect(() => {
    router.replace(localePath(locale, "/board"));
  }, [locale, router]);

  return (
    <main className="screen screen--centred" aria-busy="true">
      <BrandBubbles size={48} />
    </main>
  );
}
