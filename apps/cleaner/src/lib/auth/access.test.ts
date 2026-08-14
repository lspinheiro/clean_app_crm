import { describe, expect, it } from "vitest";

import { evaluateCleanerAccess } from "./access";

describe("CLE-19 cleaner app access", () => {
  it("refuses a visitor with no session", () => {
    expect(evaluateCleanerAccess({ userId: null, profile: null })).toEqual({
      kind: "denied",
      reason: "anonymous",
    });
  });

  it("refuses a signed-in user whose profile row is missing", () => {
    expect(evaluateCleanerAccess({ userId: "user-1", profile: null })).toEqual({
      kind: "denied",
      reason: "missing_profile",
    });
  });

  it("refuses a profile that belongs to a different user", () => {
    expect(
      evaluateCleanerAccess({
        userId: "user-1",
        profile: { id: "user-2", role: "cleaner" },
      }),
    ).toEqual({ kind: "denied", reason: "missing_profile" });
  });

  it("refuses a company admin — this app is the cleaner side", () => {
    expect(
      evaluateCleanerAccess({
        userId: "user-1",
        profile: { id: "user-1", role: "company_admin" },
      }),
    ).toEqual({ kind: "denied", reason: "wrong_role" });
  });

  it("refuses an internal admin", () => {
    expect(
      evaluateCleanerAccess({
        userId: "user-1",
        profile: { id: "user-1", role: "admin" },
      }),
    ).toEqual({ kind: "denied", reason: "wrong_role" });
  });

  it("ignores a role claimed in token metadata and trusts the profile row", () => {
    expect(
      evaluateCleanerAccess({
        userId: "user-1",
        profile: { id: "user-1", role: "company_admin" },
        untrustedMetadataRole: "cleaner",
      }),
    ).toEqual({ kind: "denied", reason: "wrong_role" });
  });

  it("admits a cleaner, whatever the token metadata claims", () => {
    expect(
      evaluateCleanerAccess({
        userId: "user-1",
        profile: { id: "user-1", role: "cleaner" },
        untrustedMetadataRole: "company_admin",
      }),
    ).toEqual({ kind: "allowed", userId: "user-1" });
  });

  it("admits a cleaner who has not joined any pool yet", () => {
    expect(
      evaluateCleanerAccess({
        userId: "user-9",
        profile: { id: "user-9", role: "cleaner" },
      }),
    ).toEqual({ kind: "allowed", userId: "user-9" });
  });
});
