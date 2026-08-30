import { describe, expect, it } from "vitest";

import * as inviteHelpers from "./invite";
import {
  buildCleanerJoinUrl,
  buildWhatsAppShareUrl,
  formatJoinedDate,
  normaliseCleanerAppUrl,
} from "./invite";

describe("cleaner invite content", () => {
  it("builds a WhatsApp handoff with percent-encoded spaces in the raw URL", () => {
    const inviteMessage =
      "Join Coastal Demo Cleaning's Cleaner staff: https://cleaner.example.test/join?code=AB12CD34EF56GH78\nInvite code: AB12CD34EF56GH78";

    expect(buildWhatsAppShareUrl(inviteMessage)).toBe(
      `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`,
    );
  });

  it("builds the configured cleaner signup URL with the active code", () => {
    expect(buildCleanerJoinUrl("https://cleaner.example.test/base", "AB12CD34EF56GH78")).toBe(
      "https://cleaner.example.test/join?code=AB12CD34EF56GH78",
    );
  });

  it("rejects malformed codes at the display boundary", () => {
    expect(() => buildCleanerJoinUrl("https://cleaner.example.test", "short")).toThrow(
      "Invite code must contain sixteen uppercase letters or numbers.",
    );
  });

  it("rejects a legacy six-character code at the display boundary", () => {
    expect(() => buildCleanerJoinUrl("https://cleaner.example.test", "CLEAN1")).toThrow(
      "Invite code must contain sixteen uppercase letters or numbers.",
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

  it("does not retain helpers for the retired rotating invitation model", () => {
    expect(inviteHelpers).not.toHaveProperty("buildInviteMessage");
    expect(inviteHelpers).not.toHaveProperty("isInviteActive");
  });

  it("formats joined dates in the product timezone", () => {
    expect(formatJoinedDate("2026-08-02T00:00:00+10:00")).toBe("2 Aug 2026");
  });
});
