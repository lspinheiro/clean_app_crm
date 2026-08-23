"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import enAu from "../../messages/en-AU.json";
import ptBr from "../../messages/pt-BR.json";

import {
  defaultLocale,
  localePath,
  localisedAddress,
  locales,
  pathWithoutLocale,
  persistLocaleCookie,
  publicLocaleFor,
  type AppLocale,
} from "@/i18n/config";

import { BrandBubbles } from "./brand-bubbles";

const noLocaleSubscription = () => () => undefined;
const notFoundMessages = { "en-AU": enAu, "pt-BR": ptBr } as const;

export function NotFoundContent() {
  const routeLocale = useSyncExternalStore(
    noLocaleSubscription,
    () => publicLocaleFor(window.location.pathname, document.cookie, navigator.languages),
    () => defaultLocale,
  );
  const [selectedLocale, setSelectedLocale] = useState<AppLocale | null>(null);
  const locale = selectedLocale ?? routeLocale;
  const messages = notFoundMessages[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${messages.NotFound.title} · ${messages.Metadata.title}`;
  }, [locale, messages]);

  function changeLocale(nextLocale: AppLocale) {
    persistLocaleCookie(nextLocale);
    const route = pathWithoutLocale(window.location.pathname);
    window.history.replaceState(
      window.history.state,
      "",
      localisedAddress(
        nextLocale,
        route,
        window.location.search,
        window.location.hash,
      ),
    );
    setSelectedLocale(nextLocale);
  }

  return (
    <main className="screen screen--centred">
      <span className="brand-lockup">
        <BrandBubbles />
        {messages.Common.brand}
      </span>
      <div className="language-control language-control--compact">
        <label htmlFor="not-found-language">{messages.LocaleSwitcher.label}</label>
        <select
          id="not-found-language"
          onChange={(event) => changeLocale(event.target.value as AppLocale)}
          value={locale}
        >
          {locales.map((option) => (
            <option key={option} value={option}>
              {messages.LocaleSwitcher[option]}
            </option>
          ))}
        </select>
      </div>
      <div className="empty-state">
        <BrandBubbles size={44} />
        <div>
          <h1 className="empty-state__title">{messages.NotFound.title}</h1>
          <p>{messages.NotFound.body}</p>
        </div>
        <a className="button button--small" href={localePath(locale, "/board")}>
          {messages.NotFound.action}
        </a>
      </div>
    </main>
  );
}
