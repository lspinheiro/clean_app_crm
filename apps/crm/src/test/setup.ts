import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import type { AppLocale } from "@/i18n/config";

afterEach(cleanup);

function testLocale(): AppLocale {
  return (globalThis as { __CRM_TEST_LOCALE__?: AppLocale }).__CRM_TEST_LOCALE__
    ?? "en-AU";
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

vi.mock("next-intl/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl/server")>();
  const intl = await vi.importActual<typeof import("next-intl")>("next-intl");
  const messages = {
    "en-AU": (await import("../../messages/en-AU.json")).default,
    "pt-BR": (await import("../../messages/pt-BR.json")).default,
  };
  return {
    ...actual,
    getLocale: async () => testLocale(),
    getMessages: async () => messages[testLocale()],
    getTranslations: async (namespace?: string) => {
      const locale = testLocale();
      return intl.createTranslator({
        locale,
        messages: messages[locale],
        namespace: namespace as never,
      });
    },
    setRequestLocale: vi.fn(),
  };
});

vi.mock("@/i18n/navigation", async () => {
  const React = await import("react");
  const nextLink = await import("next/link");
  const navigation = await import("next/navigation");
  return {
    Link: ({ href, ...props }: React.ComponentProps<typeof nextLink.default>) =>
      React.createElement(nextLink.default, { href, ...props }),
    getPathname: ({ href }: { href: string }) => href,
    redirect: ({ href, locale }: { href: string; locale: string }) => {
      throw new Error(`NEXT_REDIRECT:/${locale}${href}`);
    },
    usePathname: () =>
      typeof navigation.usePathname === "function" ? navigation.usePathname() : "/",
    useRouter: () =>
      typeof navigation.useRouter === "function"
        ? navigation.useRouter()
        : { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
  };
});
