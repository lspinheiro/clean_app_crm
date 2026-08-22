"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import {
  defaultLocale,
  isAppLocale,
  localeFromCookieString,
  localeFromLanguages,
  localePath,
  type CleanerPath,
} from "@/i18n/config";
import { getSupabaseClient } from "@/lib/supabase/client";

import { BrandBubbles } from "./brand-bubbles";

function explicitLocaleCookie() {
  return localeFromCookieString(document.cookie);
}

export function LegacyLocaleRedirect({ pathname }: Readonly<{ pathname: CleanerPath }>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let active = true;

    async function resolveLocale() {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getUser();
      let locale = explicitLocaleCookie();

      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("preferred_locale")
          .eq("id", data.user.id)
          .maybeSingle();
        if (isAppLocale(profile?.preferred_locale)) locale = profile.preferred_locale;
      }

      locale ??= typeof navigator === "undefined"
        ? defaultLocale
        : localeFromLanguages(navigator.languages);

      const basePath: CleanerPath = pathname === "/" ? "/board" : pathname;
      const query = searchParams.toString();
      if (active) router.replace(`${localePath(locale, basePath)}${query ? `?${query}` : ""}`);
    }

    void resolveLocale();
    return () => {
      active = false;
    };
  }, [pathname, router, searchParams]);

  return (
    <main aria-label="The Clean Crew" className="screen screen--centred" aria-busy="true">
      <BrandBubbles size={48} />
    </main>
  );
}
