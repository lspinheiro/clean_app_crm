import { beforeEach, describe, expect, it } from "vitest";

import { documentLocaleBootstrapScript } from "./document-locale-script";

beforeEach(() => {
  document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
  document.documentElement.lang = "en-AU";
});

describe("missing-route document language bootstrap", () => {
  it("honours the explicit cookie before an unprefixed 404 paints", () => {
    document.cookie = "NEXT_LOCALE=pt-BR; path=/";
    window.history.replaceState({}, "", "/rota-inexistente");

    new Function(documentLocaleBootstrapScript())();

    expect(document.documentElement.lang).toBe("pt-BR");
  });

  it("keeps a canonical path prefix authoritative", () => {
    document.cookie = "NEXT_LOCALE=pt-BR; path=/";
    window.history.replaceState({}, "", "/en-AU/missing");

    new Function(documentLocaleBootstrapScript())();

    expect(document.documentElement.lang).toBe("en-AU");
  });
});
