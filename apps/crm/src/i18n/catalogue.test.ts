import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import enAu from "../../messages/en-AU.json";
import ptBr from "../../messages/pt-BR.json";

function leafMessages(
  value: Record<string, unknown>,
  prefix = "",
): Map<string, string> {
  const leaves = new Map<string, string>();
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") leaves.set(path, child);
    else if (child && typeof child === "object") {
      leafMessages(child as Record<string, unknown>, path).forEach(
        (message, childPath) => leaves.set(childPath, message),
      );
    }
  }
  return leaves;
}

function argumentShapes(elements: MessageFormatElement[], result = new Map<string, number>()) {
  for (const element of elements) {
    if (
      element.type === TYPE.argument ||
      element.type === TYPE.number ||
      element.type === TYPE.date ||
      element.type === TYPE.time ||
      element.type === TYPE.select ||
      element.type === TYPE.plural
    ) {
      result.set(element.value, element.type);
    }
    if (element.type === TYPE.select || element.type === TYPE.plural) {
      Object.values(element.options).forEach((option) => argumentShapes(option.value, result));
    } else if (element.type === TYPE.tag) {
      argumentShapes(element.children, result);
    }
  }
  return [...result.entries()].sort(([left], [right]) => left.localeCompare(right));
}

describe("CRM message catalogues", () => {
  it("keeps recursive keys in parity and every ICU message valid", () => {
    const english = leafMessages(enAu);
    const portuguese = leafMessages(ptBr);

    expect([...portuguese.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, message] of english) {
      expect(message.trim(), `${key} in en-AU`).not.toBe("");
      expect(() => parse(message), `${key} in en-AU`).not.toThrow();
      const ptMessage = portuguese.get(key);
      expect(ptMessage?.trim(), `${key} in pt-BR`).not.toBe("");
      expect(() => parse(ptMessage ?? ""), `${key} in pt-BR`).not.toThrow();
      expect(argumentShapes(parse(ptMessage ?? "")), `${key} ICU arguments`).toEqual(
        argumentShapes(parse(message)),
      );
    }
  });

  it("keeps the brand literal and renders Portuguese zero counts naturally", () => {
    expect(enAu.Metadata.description).toContain("The Clean Crew");
    expect(ptBr.Metadata.description).toContain("The Clean Crew");

    const t = createTranslator({ locale: "pt-BR", messages: ptBr });
    expect(t("Jobs.count", { count: 0 })).toBe("Nenhum serviço");
    expect(t("Pool.memberCount", { count: 0 })).toBe(
      "Nenhum profissional neste banco",
    );
  });
});
