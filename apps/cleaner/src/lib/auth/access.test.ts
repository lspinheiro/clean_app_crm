import { describe, expect, it } from "vitest";

import { evaluateCleanerAccess } from "./access";

describe("CLE-81 membership-based cleaner access", () => {
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
        profile: { id: "user-2" },
        membership: {
          profile_id: "user-1",
          status: "active",
        },
      }),
    ).toEqual({ kind: "denied", reason: "missing_profile" });
  });

  it("refuses an account without a pool membership", () => {
    expect(
      evaluateCleanerAccess({
        userId: "user-1",
        profile: { id: "user-1" },
        membership: null,
      }),
    ).toEqual({ kind: "denied", reason: "missing_membership" });
  });

  it("admits a removed pool membership so the cleaner keeps the empty-board experience", () => {
    expect(
      evaluateCleanerAccess({
        userId: "user-1",
        profile: { id: "user-1" },
        membership: { profile_id: "user-1", status: "removed" },
      }),
    ).toEqual({ kind: "allowed", userId: "user-1" });
  });

  it("ignores a global role claimed in token metadata", () => {
    expect(
      evaluateCleanerAccess({
        userId: "user-1",
        profile: { id: "user-1" },
        membership: null,
        untrustedMetadataRole: "cleaner",
      }),
    ).toEqual({ kind: "denied", reason: "missing_membership" });
  });

  it("admits an active pool member, whatever the token metadata claims", () => {
    expect(
      evaluateCleanerAccess({
        userId: "user-1",
        profile: { id: "user-1" },
        membership: { profile_id: "user-1", status: "active" },
        untrustedMetadataRole: "company_admin",
      }),
    ).toEqual({ kind: "allowed", userId: "user-1" });
  });

  it("admits one login that also has unrelated company-side authority", () => {
    expect(
      evaluateCleanerAccess({
        userId: "user-9",
        profile: { id: "user-9" },
        membership: { profile_id: "user-9", status: "active" },
        untrustedMetadataRole: "owner",
      }),
    ).toEqual({ kind: "allowed", userId: "user-9" });
  });
});
