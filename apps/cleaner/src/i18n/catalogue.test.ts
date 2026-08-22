import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

const messagePaths = {
  "en-AU": resolve(process.cwd(), "messages/en-AU.json"),
  "pt-BR": resolve(process.cwd(), "messages/pt-BR.json"),
} as const;

function leafMessages(value: Record<string, unknown>, prefix = ""): Map<string, string> {
  const leaves = new Map<string, string>();
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") leaves.set(path, child);
    else if (child && typeof child === "object") {
      leafMessages(child as Record<string, unknown>, path).forEach((message, childPath) =>
        leaves.set(childPath, message),
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

describe("Cleaner message catalogues", () => {
  it("ships complete en-AU and pt-BR catalogues", () => {
    for (const path of Object.values(messagePaths)) expect(existsSync(path)).toBe(true);

    const english = JSON.parse(readFileSync(messagePaths["en-AU"], "utf8")) as Record<
      string,
      unknown
    >;
    const portuguese = JSON.parse(readFileSync(messagePaths["pt-BR"], "utf8")) as Record<
      string,
      unknown
    >;

    const englishMessages = leafMessages(english);
    const portugueseMessages = leafMessages(portuguese);
    expect([...portugueseMessages.keys()].sort()).toEqual([...englishMessages.keys()].sort());
    for (const [key, message] of englishMessages) {
      const translated = portugueseMessages.get(key) ?? "";
      expect(message.trim(), `${key} in en-AU`).not.toBe("");
      expect(translated.trim(), `${key} in pt-BR`).not.toBe("");
      expect(() => parse(message), `${key} in en-AU`).not.toThrow();
      expect(() => parse(translated), `${key} in pt-BR`).not.toThrow();
      expect(argumentShapes(parse(translated)), `${key} ICU arguments`).toEqual(
        argumentShapes(parse(message)),
      );
    }
    expect(JSON.stringify(english)).toContain("The Clean Crew");
    expect(JSON.stringify(portuguese)).toContain("The Clean Crew");
    expect(portugueseMessages.get("Services.end-of-lease-clean")).toBe(
      "Limpeza de fim de locação",
    );
  });
});
