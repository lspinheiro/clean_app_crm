import { describe, expect, it } from "vitest";

import {
  localeFromLanguages,
  localePath,
  localisedAddress,
  pathWithoutLocale,
  publicLocaleFor,
} from "./config";

describe("Cleaner device locale fallback", () => {
  it("honours the device language preference order", () => {
    expect(localeFromLanguages(["en-AU", "pt-BR"])).toBe("en-AU");
    expect(localeFromLanguages(["pt-BR", "en-AU"])).toBe("pt-BR");
  });

  it("skips unsupported languages before choosing the first supported language", () => {
    expect(localeFromLanguages(["es-AR", "pt-BR", "en-AU"])).toBe("pt-BR");
    expect(localeFromLanguages(["es-AR", "en-US", "pt-BR"])).toBe("en-AU");
  });

  it("falls back to Australian English when no device language is supported", () => {
    expect(localeFromLanguages(["es-AR", "fr-FR"])).toBe("en-AU");
  });
});

describe("Cleaner locale URLs", () => {
  it("keeps canonical URLs authoritative and negotiates only unprefixed paths", () => {
    expect(publicLocaleFor("/en-AU/missing", "NEXT_LOCALE=pt-BR", ["pt-BR"])).toBe(
      "en-AU",
    );
    expect(publicLocaleFor("/missing", "NEXT_LOCALE=pt-BR", ["en-AU"])).toBe("pt-BR");
    expect(publicLocaleFor("/missing", "", ["pt-BR", "en-AU"])).toBe("pt-BR");
  });

  it("uses the locale tuple when replacing and removing route prefixes", () => {
    expect(localePath("pt-BR", "/en-AU/board")).toBe("/pt-BR/board");
    expect(pathWithoutLocale("/pt-BR/my-jobs")).toBe("/my-jobs");
  });

  it("preserves search and hash when localising an address", () => {
    expect(localisedAddress("pt-BR", "/login", "?code=CLEAN1", "#error=denied")).toBe(
      "/pt-BR/login?code=CLEAN1#error=denied",
    );
  });
});
