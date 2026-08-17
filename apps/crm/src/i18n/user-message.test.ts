import { describe, expect, it } from "vitest";

import {
  localiseMutationResult,
  localiseUserMessage,
} from "./user-message";
import { preferredCleanerOrderSchema } from "@/features/preferred-cleaners/schema";

describe("localized validation and mutation messages", () => {
  it("keeps English stable and translates Portuguese presentation errors", () => {
    const source = "user.chooseValidSite";
    expect(localiseUserMessage(source, "en-AU")).toBe("Choose a valid site.");
    expect(localiseUserMessage(source, "pt-BR")).toBe(
      "Selecione um local válido.",
    );
  });

  it("uses a safe localized fallback for unknown or prototype-like messages", () => {
    expect(localiseUserMessage("constructor", "pt-BR")).toBe(
      "Não foi possível concluir esta ação. Tente novamente.",
    );
    expect(localiseUserMessage("Invalid UUID", "pt-BR")).toBe(
      "Não foi possível concluir esta ação. Tente novamente.",
    );
  });

  it("uses stable message identifiers at schema trust boundaries", () => {
    const result = preferredCleanerOrderSchema.safeParse({
      cleanerIds: ["not-a-uuid"],
      clientId: "not-a-uuid",
      siteId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        "user.cleanerOrderInvalid",
        "user.cleanerOrderInvalid",
        "user.cleanerOrderInvalid",
      ]);
    }
  });

  it("localizes field and form errors without changing mutation state", () => {
    expect(
      localiseMutationResult(
        {
          ok: false,
          fieldErrors: { name: "user.enterClientName" },
          formError: "user.clientCreateFailed",
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
