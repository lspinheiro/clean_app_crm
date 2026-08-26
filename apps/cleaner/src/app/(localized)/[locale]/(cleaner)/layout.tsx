"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Briefcase, ClipboardCheck, UserRound } from "lucide-react";

import { BrandBubbles } from "@/components/brand-bubbles";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NotificationBell } from "@/components/notification-bell";
import type { AppLocale } from "@/i18n/config";
import { localePath, pathWithoutLocale } from "@/i18n/config";
import { useCleaner } from "@/lib/auth/use-cleaner";
import { getSupabaseClient } from "@/lib/supabase/client";

const tabs = [
  { href: "/board", icon: Briefcase, label: "board" },
  { href: "/my-jobs", icon: ClipboardCheck, label: "myJobs" },
  { href: "/profile", icon: UserRound, label: "profile" },
] as const;

export default function CleanerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale() as AppLocale;
  const navigationT = useTranslations("Navigation");
  const commonT = useTranslations("Common");
  const cleaner = useCleaner();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (!error) {
        router.replace(localePath(locale, "/login"));
        return;
      }
    } catch {
      // A transport exception and a returned AuthError have the same recovery here.
    }
    setSigningOut(false);
    setSignOutError(true);
  }

  useEffect(() => {
    if (cleaner.status === "denied") {
      router.replace(`${localePath(locale, "/login")}?error=not-authorised`);
    }
  }, [cleaner.status, locale, router]);

  if (cleaner.status !== "allowed") {
    return (
      <main className="screen">
        <p className="screen-lead" role="status">
          {commonT("loading")}
        </p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="app-header__brand" href={localePath(locale, "/board")}>
          <BrandBubbles size={34} />
          <span>{commonT("brand")}</span>
        </Link>
        <div className="app-header__actions">
          <NotificationBell profileId={cleaner.profile.id} />
          <LanguageSwitcher authenticated compact />
          <button
            className="app-header__sign-out"
            disabled={signingOut}
            onClick={() => void signOut()}
            type="button"
          >
            {signingOut ? commonT("signingOut") : commonT("signOut")}
          </button>
          {signOutError ? (
            <span className="field-error" role="alert">
              {commonT("signOutError")}
            </span>
          ) : null}
        </div>
      </header>
      {children}
      <nav aria-label={navigationT("sections")} className="tab-bar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              aria-current={pathWithoutLocale(pathname) === tab.href ? "page" : undefined}
              className="tab-bar__tab"
              href={localePath(locale, tab.href)}
              key={tab.href}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={2} />
              <span>{navigationT(tab.label)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
