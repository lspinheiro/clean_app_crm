import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// docs/decisions/0004-cleaner-surface-wrapper-ready-pwa.md keeps this app client-first and
// static-exportable so a Capacitor shell stays a bolt-on rather than a migration. The
// constraints are cheap to honour now and expensive to reverse later, so they are asserted
// here rather than left to review.

const appRoot = process.cwd();
const srcRoot = path.join(appRoot, "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

function relative(files: string[]) {
  return files.map((file) => path.relative(appRoot, file).replaceAll("\\", "/"));
}

describe("ADR 0004 — the cleaner app stays wrapper-ready", () => {
  it("declares no server actions", () => {
    const offenders = sourceFiles(srcRoot).filter((file) =>
      /^\s*["']use server["']/m.test(readFileSync(file, "utf8")),
    );

    expect(relative(offenders)).toEqual([]);
  });

  it("ships no middleware, which a static export cannot run", () => {
    expect(existsSync(path.join(srcRoot, "proxy.ts"))).toBe(false);
    expect(existsSync(path.join(srcRoot, "middleware.ts"))).toBe(false);
  });

  it("keeps auth on the client instead of the SSR cookie pattern", () => {
    const manifest = JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf8"));
    expect(Object.keys(manifest.dependencies ?? {})).not.toContain("@supabase/ssr");

    const offenders = sourceFiles(srcRoot).filter((file) =>
      readFileSync(file, "utf8").includes("@supabase/ssr"),
    );
    expect(relative(offenders)).toEqual([]);
  });

  it("requests the PKCE flow with a locally persisted session", () => {
    const client = readFileSync(path.join(srcRoot, "lib/supabase/client.ts"), "utf8");

    expect(client).toMatch(/flowType:\s*["']pkce["']/);
    expect(client).toMatch(/persistSession:\s*true/);
  });

  it("builds as a static export", () => {
    const config = readFileSync(path.join(appRoot, "next.config.ts"), "utf8");

    expect(config).toMatch(/output:\s*["']export["']/);
  });

  it("ships a standalone web app manifest on the localised cleaner route", () => {
    const manifestPath = path.join(srcRoot, "app/manifest.ts");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = readFileSync(manifestPath, "utf8");
    expect(manifest).toMatch(/display:\s*["']standalone["']/);
    expect(manifest).toMatch(/start_url:\s*["']\/["']/);
    expect(manifest).toContain("#2563EB");
    expect(manifest).toContain("#F8FAFC");
  });
});
