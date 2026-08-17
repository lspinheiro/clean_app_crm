import { describe, expect, it } from "vitest";

import {
  localiseMutationResult,
  localiseUserMessage,
} from "./user-message";

describe("localized validation and mutation messages", () => {
  it("keeps English stable and translates Portuguese presentation errors", () => {
    const source = "Choose a valid site.";
    expect(localiseUserMessage(source, "en-AU")).toBe(source);
    expect(localiseUserMessage(source, "pt-BR")).toBe(
      "Selecione um local válido.",
    );
  });

  it("localizes field and form errors without changing mutation state", () => {
    expect(
      localiseMutationResult(
        {
          ok: false,
          fieldErrors: { name: "Enter a client name." },
          formError: "The client could not be created. Please try again.",
        },
        "pt-BR",
      ),
    ).toEqual({
      ok: false,
      fieldErrors: { name: "Insira o nome do cliente." },
      formError: "Não foi possível criar o cliente. Tente novamente.",
    });
  });
});
