import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import "@testing-library/jest-dom/vitest";

import type { AppLocale } from "@/i18n/config";

// This project runs vitest without `globals`, so testing-library never registers its own
// auto-cleanup. Without this the DOM accumulates across tests in a file and queries start
// matching elements left behind by the previous case.
afterEach(() => {
  cleanup();
  document.documentElement.lang = "en-AU";
});

function testLocale(): AppLocale {
  const explicit = (globalThis as { __CLEANER_TEST_LOCALE__?: AppLocale })
    .__CLEANER_TEST_LOCALE__;
  if (explicit) return explicit;

  const documentLocale = document.documentElement.lang;
  return documentLocale === "pt-BR" || documentLocale === "en-AU"
    ? documentLocale
    : "en-AU";
}

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const messages = {
    "en-AU": (await import("../../messages/en-AU.json")).default,
    "pt-BR": (await import("../../messages/pt-BR.json")).default,
  };

  return {
    ...actual,
    useLocale: testLocale,
    useMessages: () => messages[testLocale()],
    useTranslations: (namespace?: string) => {
      const locale = testLocale();
      return actual.createTranslator({
        locale,
        messages: messages[locale],
        namespace: namespace as never,
      });
    },
  };
});
