import { describe, expect, it } from "vitest";

import { evaluateCrmAccess } from "./access";

describe("CLE-5 company-admin access", () => {
  it("allows an authenticated company admin from the database profile", () => {
    expect(
      evaluateCrmAccess({
        userId: "user-1",
        profile: { id: "user-1", role: "company_admin" },
      }),
    ).toEqual({ kind: "allowed", userId: "user-1" });
  });

  it.each([
    {
      name: "anonymous session",
      input: { userId: null, profile: null },
      reason: "anonymous",
    },
    {
      name: "missing database profile",
      input: { userId: "user-1", profile: null },
      reason: "missing_profile",
    },
    {
      name: "cleaner profile",
      input: {
        userId: "user-1",
        profile: { id: "user-1", role: "cleaner" as const },
      },
      reason: "wrong_role",
    },
    {
      name: "spoofed metadata with a cleaner database profile",
      input: {
        userId: "user-1",
        profile: { id: "user-1", role: "cleaner" as const },
        untrustedMetadataRole: "company_admin",
      },
      reason: "wrong_role",
    },
  ])("denies $name", ({ input, reason }) => {
    expect(evaluateCrmAccess(input)).toEqual({ kind: "denied", reason });
  });
});
