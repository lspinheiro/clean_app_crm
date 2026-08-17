import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const designContract = readFileSync(resolve(process.cwd(), "../../DESIGN.md"), "utf8");
const rootLayout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");

function occurrences(source: string, value: string) {
  return source.split(value).length - 1;
}

// name → hex from DESIGN.md "Colour". The status container/on-container pairs are
// documented as `success` `#15803D` · container `#DCFCE7` · on-container `#14532D`,
// so DESIGN.md agreement is checked by backticked name where the name is written out
// and by backticked hex for every token.
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

const NAMED_IN_DESIGN_MD = [
  "primary",
  "primary-hover",
  "primary-container",
  "on-primary-container",
  "accent",
  "accent-container",
  "on-accent-container",
  "success",
  "warning",
  "danger",
  "surface",
  "surface-card",
  "surface-alt",
  "surface-border",
  "text-main",
  "text-secondary",
  "text-muted",
];

describe("Trust Blue contract", () => {
  it("keeps globals.css and DESIGN.md on the same semantic token set", () => {
    for (const [name, hex] of Object.entries(TRUST_BLUE_TOKENS)) {
      expect(css).toContain(`--color-${name}:`);
      expect(designContract).toContain(`\`${hex}\``);
    }
    for (const name of NAMED_IN_DESIGN_MD) {
      expect(designContract).toContain(`\`${name}\``);
    }
  });

  it("loads Inter and Public Sans through next/font/local with Poppins gone", () => {
    expect(rootLayout).toContain('from "next/font/local"');
    expect(rootLayout).toContain("preload: true");
    expect(rootLayout).toContain("@fontsource/inter/files/inter-latin-400-normal.woff2");
    expect(rootLayout).toContain("@fontsource/inter/files/inter-latin-700-normal.woff2");
    expect(rootLayout).toMatch(/@fontsource\/public-sans\/files\/public-sans-latin-\d{3}-normal\.woff2/);
    expect(rootLayout).not.toMatch(/poppins/i);
    expect(css).not.toMatch(/poppins/i);
    expect(rootLayout).toContain('variable: "--font-inter"');
    expect(css).toMatch(/--font-sans:[^;]*var\(--font-inter\)/);
  });

  it("keeps shape and depth on the sanctioned Trust Blue scale", () => {
    expect(css).toMatch(/\.button\s*\{[^}]*border-radius:\s*8px/);
    expect(css).toContain("--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)");
    expect(css).toContain(
      "--shadow-card: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
    );
    expect(css).not.toContain("--shadow-floating");
  });

  it("marks the active nav item with primary text and a 2px primary underline", () => {
    expect(css).toMatch(
      /\.primary-navigation a\[aria-current="page"\]\s*\{[^}]*var\(--color-primary\)/,
    );
    expect(css).toMatch(
      /\.primary-navigation a\[aria-current="page"\]::after\s*\{[^}]*var\(--color-primary\)/,
    );
    expect(css).toMatch(
      /\.primary-navigation a\[aria-current="page"\]::after\s*\{[^}]*height:\s*2px/,
    );
  });

  it("keeps the visible focus ring on the primary colour", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:[^};]*var\(--color-primary\)/);
  });

  it("uses container/on-container status pairs instead of the retired status-* tokens", () => {
    for (const retired of [
      "--color-status-info-text",
      "--color-status-info-tint",
      "--color-status-success-text",
      "--color-status-success-tint",
      "--color-status-danger-text",
      "--color-status-danger-tint",
      "--color-status-success-border",
      "--color-status-danger-soft",
      "--color-status-danger-faint",
    ]) {
      expect(css).not.toContain(retired);
    }

    expect(occurrences(css, "var(--color-success-container)")).toBeGreaterThanOrEqual(1);
    expect(occurrences(css, "var(--color-on-success-container)")).toBeGreaterThanOrEqual(1);
    expect(occurrences(css, "var(--color-danger-container)")).toBeGreaterThanOrEqual(1);
    expect(occurrences(css, "var(--color-on-danger-container)")).toBeGreaterThanOrEqual(1);
  });
});

describe("design-review conformance contracts", () => {
  it("keeps caption text on an AA-safe grey while reserving gray-500 for glyphs", () => {
    for (const selector of [
      ".field-hint",
      ".save-status",
      ".search-field input::placeholder",
      ".record-kicker",
      ".client-card__empty",
      ".breadcrumb",
      ".client-detail-count",
      ".privacy-caption",
      ".invite-rotation-note",
      ".recurring-list li.is-inactive",
      ".job-pay > span",
    ]) {
      const escapedSelector = selector.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(css).toMatch(
        new RegExp(`${escapedSelector}\\s*\\{[^}]*color: var\\(--color-gray-600\\);`),
      );
    }
    expect(occurrences(css, "color: var(--color-gray-500);")).toBe(2);
    expect(css).toMatch(/\.search-field\s*\{[^}]*color: var\(--color-gray-500\);/);
    expect(css).toMatch(/\.roster-no-work\s*\{[^}]*color: var\(--color-gray-500\);/);
  });

  it("keeps shell and temporal navigation on the 44px target floor", () => {
    expect(css).toMatch(/\.primary-navigation a\s*\{[^}]*min-width: 44px;/);
    expect(css).toMatch(/\.roster-this-week\s*\{[^}]*min-height: 44px;/);
  });

  it("lets mobile gap context wrap instead of disappearing behind ellipses", () => {
    expect(css).toMatch(
      /@media \(max-width: 560px\)[\s\S]*\.roster-entry--gap span,[\s\S]*\.roster-entry--gap small\s*\{[^}]*overflow-wrap: anywhere;[^}]*white-space: normal;/,
    );
  });

  it("does not require an unshipped New job action in the canonical shell", () => {
    expect(designContract).not.toMatch(/primary\s+"\+ New job"\s+button\s+right/);
    expect(designContract).toMatch(/No dead\s+action\s+placeholders/);
  });
});
