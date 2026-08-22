import { describe, expect, it } from "vitest";

import { localeFromLanguages, localeFromPathname, publicLocaleFor } from "./config";

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
  it("derives missing-route presentation from a canonical prefix", () => {
    expect(localeFromPathname("/pt-BR/rota-inexistente")).toBe("pt-BR");
    expect(localeFromPathname("/en-AU/missing")).toBe("en-AU");
    expect(localeFromPathname("/missing")).toBe("en-AU");
  });

  it("keeps canonical URLs authoritative and negotiates only unprefixed paths", () => {
    expect(publicLocaleFor("/en-AU/missing", "NEXT_LOCALE=pt-BR", ["pt-BR"])).toBe(
      "en-AU",
    );
    expect(publicLocaleFor("/missing", "NEXT_LOCALE=pt-BR", ["en-AU"])).toBe("pt-BR");
    expect(publicLocaleFor("/missing", "", ["pt-BR", "en-AU"])).toBe("pt-BR");
  });
});
