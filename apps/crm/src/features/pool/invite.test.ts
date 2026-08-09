import { describe, expect, it } from "vitest";

import {
  buildCleanerJoinUrl,
  buildInviteMessage,
  formatJoinedDate,
  isInviteActive,
  normaliseCleanerAppUrl,
} from "./invite";

describe("pool invite content", () => {
  it("builds the configured cleaner signup URL with the active code", () => {
    expect(buildCleanerJoinUrl("https://cleaner.example.test/base", "AB12CD")).toBe(
      "https://cleaner.example.test/join?code=AB12CD",
    );
  });

  it("keeps the full signup URL and readable code in one link-first message", () => {
    expect(
      buildInviteMessage(
        "Coastal Demo Cleaning",
        "http://127.0.0.1:3001/join?code=CLEAN1",
        "CLEAN1",
      ),
    ).toBe(
      "Join Coastal Demo Cleaning's cleaner pool: http://127.0.0.1:3001/join?code=CLEAN1\nInvite code: CLEAN1",
    );
  });

  it("rejects malformed codes at the display boundary", () => {
    expect(() => buildCleanerJoinUrl("https://cleaner.example.test", "short")).toThrow(
      "Invite code must contain six uppercase letters or numbers.",
    );
  });

  it("accepts only an HTTP or HTTPS cleaner-app origin", () => {
    expect(normaliseCleanerAppUrl("https://cleaner.example.test/path")).toBe(
      "https://cleaner.example.test",
    );
    expect(() => normaliseCleanerAppUrl("file:///tmp/cleaner")).toThrow(
      "Cleaner app URL must use HTTP or HTTPS.",
    );
  });

  it("treats only unexpired, unrevoked-query results as active", () => {
    const now = new Date("2026-08-09T12:00:00+10:00");
    expect(isInviteActive(null, now)).toBe(true);
    expect(isInviteActive("2026-08-09T12:01:00+10:00", now)).toBe(true);
    expect(isInviteActive("2026-08-09T12:00:00+10:00", now)).toBe(false);
    expect(isInviteActive("2026-08-09T11:59:00+10:00", now)).toBe(false);
  });

  it("formats joined dates in the product timezone", () => {
    expect(formatJoinedDate("2026-08-02T00:00:00+10:00")).toBe("2 Aug 2026");
  });
});
