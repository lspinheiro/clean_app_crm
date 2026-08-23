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

  it("defines the functional motion scale and consumes it for finite transitions", () => {
    expect(designContract).toContain("`--duration-fast` `150ms`");
    expect(designContract).toContain("`--duration-standard` `250ms`");
    expect(designContract).toContain("`--ease-standard` `cubic-bezier(0.2, 0, 0, 1)`");
    expect(designContract).toContain("`--ease-exit` `cubic-bezier(0.4, 0, 1, 1)`");
    expect(designContract).toContain("No sibling staggering");
    expect(designContract).toContain("View Transitions are out of scope");

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

  it("shares roster macro-geometry between loaded and loading states at each breakpoint", () => {
    expect(css).toMatch(/:root\s*\{[^}]*--roster-grid-min-width:\s*960px;/);
    expect(css).toMatch(/:root\s*\{[^}]*--roster-label-column-width:\s*188px;/);
    expect(css).toMatch(/\.roster-grid\s*\{[^}]*min-width:\s*var\(--roster-grid-min-width\);/);
    expect(css).toMatch(
      /\.roster-loading__row\s*\{[^}]*min-width:\s*var\(--roster-grid-min-width\);[^}]*grid-template-columns:\s*var\(--roster-label-column-width\) repeat\(7, minmax\(0, 1fr\)\);/,
    );
    expect(css).toMatch(
      /\.roster-grid thead th:first-child,[\s\S]*?\.roster-grid tbody th\s*\{[^}]*width:\s*var\(--roster-label-column-width\);/,
    );
    expect(css).toMatch(
      /@media \(max-width: 880px\)[\s\S]*?:root\s*\{[^}]*--roster-grid-min-width:\s*840px;[^}]*--roster-label-column-width:\s*128px;/,
    );
    expect(css).toMatch(/\.roster-skeleton\s*\{[^}]*background:\s*var\(--color-surface-alt\);/);
    expect(css).toMatch(
      /\.roster-skeleton::after\s*\{[\s\S]*?var\(--color-surface-border\)[\s\S]*?animation:\s*roster-shimmer/,
    );
  });

  it("shares stable macro-geometry between every async route and its skeleton", () => {
    const geometryTokens: Record<string, string> = {
      "clients-site-row-columns": "36px minmax(0, 1fr)",
      "client-detail-summary-min-height": "76px",
      "import-template-columns": "repeat(2, minmax(0, 1fr))",
      "job-list-columns": "116px minmax(0, 1fr) minmax(120px, auto)",
      "job-list-row-min-height": "116px",
      "new-job-section-columns": "minmax(180px, 0.65fr) minmax(0, 1.6fr)",
      "job-detail-section-columns": "210px minmax(0, 1fr)",
      "money-totals-columns": "repeat(2, minmax(0, 1fr))",
      "money-table-header-height": "46px",
      "money-table-row-min-height": "68px",
      "cleaners-layout-columns": "minmax(0, 1.35fr) minmax(300px, 0.85fr)",
      "settings-identity-columns": "minmax(0, 1fr) 132px",
    };

    for (const [name, value] of Object.entries(geometryTokens)) {
      expect(css).toContain(`--${name}: ${value};`);
      expect(occurrences(css, `var(--${name})`), name).toBeGreaterThanOrEqual(2);
    }

    expect(css).toMatch(/\.money-loading__table\s*\{[^}]*table-layout:\s*fixed;/);
    expect(css).toMatch(/\.route-skeleton\s*\{[^}]*var\(--color-surface-alt\)/);
    expect(css).toMatch(
      /\.route-skeleton::after\s*\{[\s\S]*?var\(--color-surface-border\)[\s\S]*?animation:\s*route-shimmer/,
    );
  });

  it("keeps the import picker heading in the loaded row span at each breakpoint", () => {
    expect(css).toMatch(
      /\.import-loading__picker-heading\s*\{[^}]*grid-row:\s*span 2;/,
    );
    const tabletRules = css.slice(
      css.indexOf("@media (max-width: 880px)"),
      css.indexOf("@media (max-width: 560px)"),
    );
    expect(tabletRules).toMatch(
      /\.import-loading__picker-heading\s*\{[^}]*grid-row:\s*auto;/,
    );
  });

  it("lets the responsive job-column token drive loaded and loading rows", () => {
    const tabletRules = css.slice(
      css.indexOf("@media (max-width: 880px)"),
      css.indexOf("@media (max-width: 560px)"),
    );
    const mobileRules = css.slice(
      css.indexOf("@media (max-width: 560px)"),
      css.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(tabletRules).toContain("--job-list-columns: 88px minmax(0, 1fr);");
    expect(mobileRules).toContain("--job-list-columns: 1fr;");
    expect(tabletRules).not.toMatch(
      /\.job-list-link\s*\{[^}]*grid-template-columns:/,
    );
    expect(mobileRules).not.toMatch(
      /\.job-list-link\s*\{[^}]*grid-template-columns:/,
    );
  });

  it("makes motion effectively static for reduced-motion users", () => {
    expect(designContract).toContain("elements and pseudo-elements");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before, \*::after\s*\{[^}]*animation-duration:\s*0\.01ms !important;[^}]*animation-iteration-count:\s*1 !important;[^}]*transition-duration:\s*0\.01ms !important;/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.route-skeleton::after[\s\S]*?animation:\s*none !important;/,
    );
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
  it("keeps outlined danger actions off the primary blue fill", () => {
    expect(css).toMatch(
      /\.button--danger\s*{[^}]*background:\s*var\(--color-surface-card\);[^}]*color:\s*var\(--color-on-danger-container\);/,
    );
  });

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
    expect(occurrences(css, "color: var(--color-gray-500);")).toBe(3);
    expect(css).toMatch(
      /\.company-switcher__chevron\s*\{[^}]*color: var\(--color-gray-500\);/,
    );
    expect(css).toMatch(/\.search-field\s*\{[^}]*color: var\(--color-gray-500\);/);
    expect(css).toMatch(/\.roster-no-work\s*\{[^}]*color: var\(--color-gray-500\);/);
  });

  it("keeps shell and temporal navigation on the 44px target floor", () => {
    expect(css).toMatch(/\.primary-navigation a\s*\{[^}]*min-width: 44px;/);
    expect(css).toMatch(/\.roster-this-week\s*\{[^}]*min-height: 44px;/);
  });

  it("leaves enough mobile navigation space for Portuguese labels", () => {
    const mobileRules = css.slice(
      css.indexOf("@media (max-width: 560px)"),
      css.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(mobileRules).toMatch(/\.primary-navigation\s*\{[^}]*gap:\s*16px;/);
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
