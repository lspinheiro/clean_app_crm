import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const designContract = readFileSync(resolve(process.cwd(), "../../DESIGN.md"), "utf8");
const rootLayout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");

function occurrences(source: string, value: string) {
  return source.split(value).length - 1;
}

describe("CLE-41 status token and roster CSS contract", () => {
  it("uses documented semantic status tokens across jobs and roster surfaces", () => {
    for (const token of [
      "status-info-text",
      "status-info-tint",
      "status-success-text",
      "status-success-tint",
      "status-danger-text",
      "status-danger-tint",
    ]) {
      expect(css).toContain(`--color-${token}:`);
      expect(designContract).toContain(`\`${token}\``);
    }
    for (const token of [
      "status-success-border",
      "status-danger-soft",
      "status-danger-faint",
    ]) {
      expect(css).toContain(`--color-${token}:`);
      expect(designContract).toContain(`\`${token}\``);
    }

    expect(occurrences(css, "var(--color-status-success-text)")).toBeGreaterThanOrEqual(2);
    expect(occurrences(css, "var(--color-status-danger-text)")).toBeGreaterThanOrEqual(3);
    expect(occurrences(css, "#006735")).toBe(1);
    expect(occurrences(css, "#9b1100")).toBe(1);
    expect(css).not.toContain("#8b1000");
    expect(css).toMatch(
      /\.roster-grid tbody th small\s*\{[^}]*color: var\(--color-status-danger-text\);/,
    );
  });

  it("keeps roster radii, depth, and table declarations on the sanctioned scale", () => {
    expect(css).toMatch(/\.roster-view-switch\s*\{[^}]*border-radius: 8px;/);
    expect(css).toMatch(/\.roster-summary-bar\s*\{[^}]*box-shadow: var\(--shadow-floating\);/);
    expect(css).not.toMatch(/\.roster-grid tbody th\s*\{[^}]*min-height:/);
    expect(css).toContain(".roster-grid tbody .roster-gap-row th");
  });
});

describe("CLE-42 font and roster skeleton performance contract", () => {
  it("loads each Poppins weight through next/font/local instead of CSS imports", () => {
    expect(rootLayout).toContain('from "next/font/local"');
    expect(rootLayout).not.toMatch(/import\s+["']@fontsource\/poppins\//);
    expect(rootLayout).toContain("preload: true");
    expect(rootLayout).toContain('display: "optional"');
    expect(rootLayout).toContain("poppins.variable");
    for (const weight of ["400", "500", "600", "700", "800"]) {
      expect(rootLayout).toContain(`weight: \"${weight}\"`);
    }
  });

  it("matches the loaded roster grid at desktop and phone widths", () => {
    expect(css).toMatch(
      /\.roster-loading__row\s*\{[^}]*min-width: 960px;[^}]*grid-template-columns: 188px repeat\(7, minmax\(0, 1fr\)\);/,
    );
    expect(css).toMatch(
      /@media \(max-width: 560px\)[\s\S]*\.roster-loading__row\s*\{[^}]*min-width: 840px;[^}]*grid-template-columns: 128px repeat\(7, minmax\(0, 1fr\)\);/,
    );
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
    expect(designContract).not.toContain('primary "+ New job" button right');
    expect(designContract).toMatch(/No dead action\s+placeholders/);
  });
});
