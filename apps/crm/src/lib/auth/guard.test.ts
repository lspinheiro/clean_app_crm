import { describe, expect, it } from "vitest";

import { evaluateCrmAccess } from "./access";

describe("CLE-81 membership-based CRM access", () => {
  it.each(["owner", "staff"] as const)(
    "allows an authenticated account with an active %s employee membership",
    (role) => {
    expect(
      evaluateCrmAccess({
        userId: "user-1",
          profile: { id: "user-1" },
          membership: {
            company_id: "company-1",
            profile_id: "user-1",
            role,
            status: "active",
          },
      }),
    ).toEqual({ kind: "allowed", userId: "user-1" });
    },
  );

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
      name: "missing employee membership",
      input: {
        userId: "user-1",
        profile: { id: "user-1" },
        membership: null,
      },
      reason: "missing_membership",
    },
    {
      name: "removed employee membership",
      input: {
        userId: "user-1",
        profile: { id: "user-1" },
        membership: {
          company_id: "company-1",
          profile_id: "user-1",
          role: "owner" as const,
          status: "removed" as const,
        },
      },
      reason: "inactive_membership",
    },
    {
      name: "another account's employee membership",
      input: {
        userId: "user-1",
        profile: { id: "user-1" },
        membership: {
          company_id: "company-1",
          profile_id: "user-2",
          role: "owner" as const,
          status: "active" as const,
        },
      },
      reason: "missing_membership",
    },
    {
      name: "spoofed global role without an employee membership",
      input: {
        userId: "user-1",
        profile: { id: "user-1" },
        membership: null,
        untrustedMetadataRole: "company_admin",
      },
      reason: "missing_membership",
    },
  ])("denies $name", ({ input, reason }) => {
    expect(evaluateCrmAccess(input)).toEqual({ kind: "denied", reason });
  });

  it.each([null, "pending", "suspended"] as const)(
    "denies a company admin when the company status is %s",
    (companyStatus) => {
      const input = {
        userId: "user-1",
        profile: { id: "user-1" },
        membership: {
          company_id: "company-1",
          profile_id: "user-1",
          role: "staff" as const,
          status: "active" as const,
        },
        companyStatus,
      };

      expect(evaluateCrmAccess(input)).toEqual({
        kind: "denied",
        reason: "company_not_approved",
      });
    },
  );
});
