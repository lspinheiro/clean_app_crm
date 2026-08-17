import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const messages = (await import("../../messages/en-AU.json")).default;
  return {
    ...actual,
    useLocale: () => "en-AU",
    useMessages: () => messages,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: "en-AU", messages, namespace: namespace as never }),
  };
});

vi.mock("next-intl/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl/server")>();
  const intl = await vi.importActual<typeof import("next-intl")>("next-intl");
  const messages = (await import("../../messages/en-AU.json")).default;
  return {
    ...actual,
    getLocale: async () => "en-AU",
    getMessages: async () => messages,
    getTranslations: async (namespace?: string) =>
      intl.createTranslator({ locale: "en-AU", messages, namespace: namespace as never }),
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
