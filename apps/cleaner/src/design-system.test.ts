import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const globalsPath = path.resolve(process.cwd(), "src/app/globals.css");
const contractPath = path.resolve(process.cwd(), "../../DESIGN.md");

describe("CLE-19 cleaner app design-system plumbing", () => {
  it("loads Tailwind v4 and the canonical The Clean Crew semantic colours", async () => {
    const css = await readFile(globalsPath, "utf8");

    expect(css).toContain('@import "tailwindcss"');
    expect(css).toContain("--color-ink: #000000");
    expect(css).toContain("--color-paper: #ffffff");
    expect(css).toContain("--color-bubble: #00c2ff");
    expect(css).toContain("--color-success: #06c167");
    expect(css).toContain("--color-danger: #e11900");
  });

  it("keeps the implemented radii and tracks the canonical card shadow", async () => {
    const css = await readFile(globalsPath, "utf8");
    const contract = await readFile(contractPath, "utf8");

    expect(css).toMatch(/\.field input\s*\{[^}]*border-radius: 8px;/);
    expect(css).toMatch(/\.invite-card\s*\{[^}]*border-radius: 12px;/);
    expect(css).toMatch(/\.button\s*\{[^}]*border-radius: 999px;/);
    expect(css).toContain("--shadow-floating: 0 4px 16px rgb(0 0 0 / 0.08);");
    expect(contract).toContain(
      "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 /",
    );
  });

  it("meets the 44px touch floor and the 48px input height", async () => {
    const css = await readFile(globalsPath, "utf8");

    expect(css).toMatch(/\.button\s*\{[^}]*min-height: 52px;/);
    expect(css).toMatch(/\.button--small\s*\{[^}]*min-height: 44px;/);
    expect(css).toMatch(/\.field input\s*\{[^}]*min-height: 48px;/);
  });

  it("keeps caption greys on the AA-safe token", async () => {
    for (const selector of [".field-hint", ".consent-caption", ".invite-card__pool"]) {
      const css = await readFile(globalsPath, "utf8");
      const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(css).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*color: var\\(--color-gray-600\\);`));
    }
  });

  it("lays the app out at the phone design width the contract specifies", async () => {
    const css = await readFile(globalsPath, "utf8");
    const contract = await readFile(contractPath, "utf8");

    expect(css).toMatch(/\.screen\s*\{[^}]*max-width: var\(--screen-max\);/);
    expect(contract).toContain("390px design width");
  });

  it("honours reduced motion", async () => {
    const css = await readFile(globalsPath, "utf8");

    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
