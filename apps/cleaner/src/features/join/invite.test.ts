import { describe, expect, it } from "vitest";

import {
  cleanerCountCopy,
  inviteProblem,
  isInviteState,
  joinFailureKey,
  normaliseInviteCode,
} from "./invite";

describe("CLE-19 invite code handling", () => {
  it("accepts the four states the database reports", () => {
    for (const state of ["active", "expired", "revoked", "unknown"]) {
      expect(isInviteState(state)).toBe(true);
    }
    expect(isInviteState("something-else")).toBe(false);
  });

  it("upper-cases and trims a code pasted from a chat message", () => {
    expect(normaliseInviteCode("  clean1demojoin99 ")).toBe("CLEAN1DEMOJOIN99");
  });
});

describe("CLE-19 invite problems map to UI copy", () => {
  it("tells an expired link holder what to do next", () => {
    expect(
      inviteProblem({
        state: "expired",
        companyName: "Coastal Demo Cleaning",
        cleanerCount: 3,
      }),
    ).toEqual({ key: "inviteExpiredCompany", values: { company: "Coastal Demo Cleaning" } });
  });

  it("tells a superseded link holder what to do next", () => {
    expect(
      inviteProblem({
        state: "revoked",
        companyName: "Coastal Demo Cleaning",
        cleanerCount: 3,
      }),
    ).toEqual({ key: "inviteRevokedCompany", values: { company: "Coastal Demo Cleaning" } });
  });

  it("does not name a company it could not find", () => {
    expect(
      inviteProblem({ state: "unknown", companyName: null, cleanerCount: 0 }),
    ).toEqual({ key: "inviteUnknown" });
  });

  it("falls back to a company-free sentence when the name is missing", () => {
    expect(
      inviteProblem({ state: "expired", companyName: null, cleanerCount: 0 }),
    ).toEqual({ key: "inviteExpired" });
  });

  it("has nothing to say about a live link", () => {
    expect(
      inviteProblem({
        state: "active",
        companyName: "Coastal Demo Cleaning",
        cleanerCount: 3,
      }),
    ).toBeNull();
  });
});

describe("CLE-19 join failures", () => {
  it("turns each database refusal into a sentence a cleaner can act on", () => {
    expect(joinFailureKey("Invite code not found")).toBe("joinUnknown");
    expect(joinFailureKey("Invite code is no longer active")).toBe("joinInactive");
    expect(joinFailureKey("Invite code has expired")).toBe("joinExpired");
    expect(joinFailureKey("Cleaner access required")).toBe("cleanerAccessRequired");
    expect(joinFailureKey("This company removed you from their pool")).toBe("removed");
  });

  it("never shows a raw database message", () => {
    expect(joinFailureKey('duplicate key value violates unique constraint "x"')).toBe("joinError");
  });
});

describe("CLE-19 cleaner count copy", () => {
  it("describes zero separately and supplies plural counts to the translator", () => {
    expect(cleanerCountCopy(0)).toEqual({ key: "firstCleaner", values: undefined });
    expect(cleanerCountCopy(1)).toEqual({ key: "cleanerCount", values: { count: 1 } });
    expect(cleanerCountCopy(7)).toEqual({ key: "cleanerCount", values: { count: 7 } });
  });
});
