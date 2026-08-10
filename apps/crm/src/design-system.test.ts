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

    expect(occurrences(css, "var(--color-status-success-text)")).toBeGreaterThanOrEqual(2);
    expect(occurrences(css, "var(--color-status-danger-text)")).toBeGreaterThanOrEqual(3);
    expect(occurrences(css, "#006735")).toBe(1);
    expect(occurrences(css, "#9b1100")).toBe(1);
    expect(css).not.toContain("#8b1000");
  });

  it("keeps roster radii, depth, and table declarations on the sanctioned scale", () => {
    expect(css).toMatch(/\.roster-view-switch\s*\{[^}]*border-radius: 8px;/s);
    expect(css).toMatch(/\.roster-summary-bar\s*\{[^}]*box-shadow: var\(--shadow-floating\);/s);
    expect(css).not.toMatch(/\.roster-grid tbody th\s*\{[^}]*min-height:/s);
    expect(css).toContain(".roster-grid tbody .roster-gap-row th");
  });
});

describe("CLE-42 font and roster skeleton performance contract", () => {
  it("loads each Poppins weight through next/font/local instead of CSS imports", () => {
    expect(rootLayout).toContain('from "next/font/local"');
    expect(rootLayout).not.toMatch(/import\s+["']@fontsource\/poppins\//);
    expect(rootLayout).toContain("preload: true");
    expect(rootLayout).toContain("poppins.variable");
    for (const weight of ["400", "500", "600", "700", "800"]) {
      expect(rootLayout).toContain(`weight: \"${weight}\"`);
    }
  });

  it("matches the loaded roster grid at desktop and phone widths", () => {
    expect(css).toMatch(
      /\.roster-loading__row\s*\{[^}]*min-width: 960px;[^}]*grid-template-columns: 188px repeat\(7, minmax\(0, 1fr\)\);/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 560px\)[\s\S]*\.roster-loading__row\s*\{[^}]*min-width: 840px;[^}]*grid-template-columns: 128px repeat\(7, minmax\(0, 1fr\)\);/s,
    );
  });
});
