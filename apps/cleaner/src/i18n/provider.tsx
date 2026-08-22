"use client";

import { NextIntlClientProvider } from "next-intl";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase/client";

import {
  localePath,
  persistLocaleCookie,
  type AppLocale,
} from "./config";
import { messagesByLocale } from "./messages";

type LocaleContextValue = {
  locale: AppLocale;
  pending: boolean;
  error: boolean;
  changeLocale: (locale: AppLocale, authenticated: boolean) => Promise<boolean>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function replaceLocaleInAddress(locale: AppLocale) {
  const nextPath = localePath(locale, window.location.pathname);
  const nextAddress = `${nextPath}${window.location.search}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", nextAddress);
}

export function CleanerIntlProvider({
  children,
  initialLocale,
}: Readonly<{ children: React.ReactNode; initialLocale: AppLocale }>) {
  const [locale, setLocale] = useState(initialLocale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const changeLocale = useCallback(
    async (nextLocale: AppLocale, authenticated: boolean) => {
      if (nextLocale === locale) return true;

      setPending(true);
      setError(false);

      if (authenticated) {
        const { error: preferenceError } = await getSupabaseClient().rpc(
          "set_preferred_locale",
          { target_locale: nextLocale },
        );
        if (preferenceError) {
          setPending(false);
          setError(true);
          return false;
        }
      }

      persistLocaleCookie(nextLocale);
      document.documentElement.lang = nextLocale;
      replaceLocaleInAddress(nextLocale);
      setLocale(nextLocale);
      setPending(false);
      return true;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, pending, error, changeLocale }),
    [changeLocale, error, locale, pending],
  );

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={messagesByLocale[locale]}
        timeZone="Australia/Brisbane"
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useCleanerLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useCleanerLocale must be used inside CleanerIntlProvider");
  return value;
}
