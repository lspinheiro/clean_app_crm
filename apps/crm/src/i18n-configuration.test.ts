import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  defaultLocale,
  languageSelectionEnabled,
  locales,
} from "./i18n/config";
import { routing } from "./i18n/routing";

describe("CRM language configuration", () => {
  it("enables next-intl in the application configuration", async () => {
    const packageJson = JSON.parse(
      await readFile(path.resolve(process.cwd(), "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const nextConfig = await readFile(path.resolve(process.cwd(), "next.config.ts"), "utf8");

    expect(packageJson.dependencies?.["next-intl"]).toBeDefined();
    expect(nextConfig).toContain("createNextIntlPlugin");
    expect(locales).toEqual(["en-AU", "pt-BR"]);
    expect(defaultLocale).toBe("en-AU");
    expect(languageSelectionEnabled).toBe(true);
  });

  it("keeps the selected locale across browser sessions", () => {
    expect(routing.localeCookie).toMatchObject({
      maxAge: 60 * 60 * 24 * 365,
      name: "NEXT_LOCALE",
      sameSite: "lax",
    });
  });
});
