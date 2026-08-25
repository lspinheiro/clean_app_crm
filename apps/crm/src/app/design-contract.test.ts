import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const TRUST_BLUE_TOKENS: Record<string, string> = {
  primary: "#2563EB",
  "primary-hover": "#1E40AF",
  "primary-container": "#DBEAFE",
  "on-primary-container": "#1E3A8A",
  accent: "#06B6D4",
  "accent-container": "#CFFAFE",
  "on-accent-container": "#164E63",
  success: "#15803D",
  "success-container": "#DCFCE7",
  "on-success-container": "#14532D",
  warning: "#D97706",
  "warning-container": "#FEF3C7",
  "on-warning-container": "#78350F",
  danger: "#B91C1C",
  "danger-container": "#FEE2E2",
  "on-danger-container": "#7F1D1D",
  surface: "#F8FAFC",
  "surface-card": "#FFFFFF",
  "surface-alt": "#F1F5F9",
  "surface-border": "#E2E8F0",
  "text-main": "#0F172A",
  "text-secondary": "#334155",
  "text-muted": "#64748B",
};

describe("Trust Blue design-system plumbing", () => {
  it("loads Tailwind v4 and defines the Trust Blue core tokens with the DESIGN.md hexes", async () => {
    const css = await readFile(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain('@import "tailwindcss"');
    for (const [name, hex] of Object.entries(TRUST_BLUE_TOKENS)) {
      expect(css).toMatch(new RegExp(`--color-${name}:\\s*${hex}\\b`, "i"));
    }
  });

  it("removes the retired ink-on-paper core palette", async () => {
    const css = await readFile(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css.toLowerCase()).not.toContain("#00c2ff");
    expect(css).not.toContain("--color-ink: #000000");
    expect(css.toLowerCase()).not.toContain("#06c167");
    expect(css.toLowerCase()).not.toContain("#e11900");
  });

  it("keeps compact buttons at the 44px minimum touch target", async () => {
    const css = await readFile(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/\.button--small\s*{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.preferred-add-row \.button\s*{[^}]*min-height:\s*44px/);
  });

  it("keeps deep-linked application queues below the sticky header", async () => {
    const css = await readFile(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/#applications\s*{[^}]*scroll-margin-top:/);
  });

  it("registers easing utilities separately from regular duration variables", async () => {
    const css = await readFile(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/@theme\s*\{[^}]*--ease-standard:\s*cubic-bezier\(0\.2, 0, 0, 1\);/);
    expect(css).toMatch(/@theme\s*\{[^}]*--ease-exit:\s*cubic-bezier\(0\.4, 0, 1, 1\);/);
    expect(css).toMatch(/:root\s*\{[^}]*--duration-fast:\s*150ms;/);
    expect(css).toMatch(/:root\s*\{[^}]*--duration-standard:\s*250ms;/);
  });
});
