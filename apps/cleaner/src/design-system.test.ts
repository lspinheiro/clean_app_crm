import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const globalsPath = path.resolve(process.cwd(), "src/app/globals.css");
const contractPath = path.resolve(process.cwd(), "../../DESIGN.md");

describe("CLE-19 cleaner app design-system plumbing", () => {
  it("loads Tailwind v4 and the canonical The Clean Crew semantic colours", async () => {
    const css = await readFile(globalsPath, "utf8");

    expect(css).toContain('@import "tailwindcss"');
    expect(css).toContain("--color-primary: #2563eb");
    expect(css).toContain("--color-ink: #0f172a");
    expect(css).toContain("--color-paper: #ffffff");
    expect(css).toContain("--color-bubble: #06b6d4");
    expect(css).toContain("--color-success: #15803d");
    expect(css).toContain("--color-danger: #b91c1c");
  });

  it("keeps the implemented radii and the two canonical Trust Blue shadow levels", async () => {
    const css = await readFile(globalsPath, "utf8");
    const contract = await readFile(contractPath, "utf8");

    expect(css).toMatch(/\.field input\s*\{[^}]*border-radius: 8px;/);
    expect(css).toMatch(/\.invite-card\s*\{[^}]*border-radius: 12px;/);
    expect(css).toMatch(/\.button\s*\{[^}]*border-radius: 8px;/);
    // The Trust Blue redesign replaced the single floating shadow with two levels. The CRM
    // moved at the time; this app did not, and the mismatch is what the contract assertion
    // below is for. Both values are quoted from DESIGN.md, which is canonical for the code,
    // for Stitch generation, and for impeccable alike.
    expect(css).toContain("--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)");
    expect(css).toContain(
      "--shadow-card: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
    );
    expect(css).not.toContain("--shadow-floating");
    expect(contract).toContain("0 1px 2px 0 rgb(0 0 0 / 0.05)");
    expect(contract).toContain(
      "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 /",
    );
  });

  it("meets the 44px touch floor and the 48px input height", async () => {
    const css = await readFile(globalsPath, "utf8");

    expect(css).toMatch(/\.button\s*\{[^}]*min-height: 52px;/);
    expect(css).toMatch(/\.button--small\s*\{[^}]*min-height: 44px;/);
    expect(css).toMatch(/\.field input\s*\{[^}]*min-height: 48px;/);
    expect(css).toMatch(/\.language-control select\s*\{[^}]*min-height: 44px;/);
    expect(css).not.toMatch(
      /\.language-control--compact select\s*\{[^}]*min-height:\s*(?:[0-3]?\d|4[0-3])px;/,
    );
  });

  it("keeps caption greys on the AA-safe token", async () => {
    const css = await readFile(globalsPath, "utf8");
    expect(css).toContain("--color-gray-600: #475569");
    for (const selector of [".field-hint", ".consent-caption", ".invite-card__cleaners"]) {
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

  it("protects full own-language names in the compact signed-in control", async () => {
    const css = await readFile(globalsPath, "utf8");

    expect(css).toMatch(/\.language-control--compact\s*\{[^}]*flex:\s*0 0 auto;/);
    expect(css).toMatch(
      /\.language-control--compact select\s*\{[^}]*min-width:\s*184px;[^}]*width:\s*184px;/,
    );
  });

  it("keeps applied work compact and Withdraw visually quiet", async () => {
    const css = await readFile(globalsPath, "utf8");

    expect(css).toMatch(/\.vacancy-card--applied\s*\{[^}]*display:\s*grid;/);
    expect(css).toMatch(
      /\.vacancy-card--applied \.vacancy-card__actions \.button\s*\{[^}]*width:\s*auto;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*color:\s*var\(--color-primary\);/,
    );
  });

  it("honours reduced motion", async () => {
    const css = await readFile(globalsPath, "utf8");

    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before, \*::after\s*\{[^}]*animation-duration:\s*0\.01ms !important;[^}]*animation-iteration-count:\s*1 !important;[^}]*transition-duration:\s*0\.01ms !important;/,
    );
  });

  it("uses the canonical motion tokens for finite transitions", async () => {
    const css = await readFile(globalsPath, "utf8");
    const contract = await readFile(contractPath, "utf8");

    expect(contract).toContain("`--duration-fast` `150ms`");
    expect(contract).toContain("`--duration-standard` `250ms`");
    expect(css).toMatch(/@theme\s*\{[^}]*--ease-standard:\s*cubic-bezier\(0\.2, 0, 0, 1\);/);
    expect(css).toMatch(/@theme\s*\{[^}]*--ease-exit:\s*cubic-bezier\(0\.4, 0, 1, 1\);/);
    expect(css).toMatch(/:root\s*\{[^}]*--duration-fast:\s*150ms;/);
    expect(css).toMatch(/:root\s*\{[^}]*--duration-standard:\s*250ms;/);

    const transitions = css.match(/transition:\s*[^;]+;/g) ?? [];
    expect(transitions.length).toBeGreaterThan(0);
    for (const transition of transitions) {
      expect(transition).toContain("var(--duration-fast)");
      expect(transition).toContain("var(--ease-standard)");
      expect(transition).not.toMatch(/\b150ms\b/);
    }
  });
});
