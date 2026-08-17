import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("The Clean Crew brand mark", () => {
  it("ships the bubble-crew favicon in the app router", () => {
    expect(existsSync(resolve(process.cwd(), "src/app/icon.svg"))).toBe(true);
    const icon = read("src/app/icon.svg").toLowerCase();
    expect(icon).toContain("#2563eb");
    expect(icon).toContain("#06b6d4");
    expect(icon).toContain("#64748b");
  });

  it("renders the bubble-crew mark instead of the retired CA initials", () => {
    const bubbles = read("src/components/brand-bubbles.tsx").toLowerCase();
    expect(bubbles).toContain("#2563eb");
    expect(bubbles).toContain("#06b6d4");
    expect(bubbles).toContain("#64748b");

    const header = read("src/components/crm-header.tsx");
    expect(header).toContain("BrandBubbles");
    expect(header).not.toContain(">CA<");

    const login = read("src/app/[locale]/(auth)/login/page.tsx");
    expect(login).toContain("BrandBubbles");
    expect(login).not.toContain(">CA<");
  });
});
