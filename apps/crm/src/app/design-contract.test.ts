import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("CLE-5 design-system plumbing", () => {
  it("loads Tailwind v4 and the canonical Clean App semantic colours", async () => {
    const css = await readFile(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain('@import "tailwindcss"');
    expect(css).toContain("--color-ink: #000000");
    expect(css).toContain("--color-paper: #ffffff");
    expect(css).toContain("--color-bubble: #00c2ff");
    expect(css).toContain("--color-success: #06c167");
    expect(css).toContain("--color-danger: #e11900");
  });

  it("keeps compact buttons at the 44px minimum touch target", async () => {
    const css = await readFile(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/\.button--small\s*{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.preferred-add-row \.button\s*{[^}]*min-height:\s*44px/);
  });
});
