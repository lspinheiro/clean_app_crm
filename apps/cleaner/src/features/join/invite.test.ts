import { describe, expect, it } from "vitest";

import {
  describeInviteProblem,
  describeJoinFailure,
  describeCleanerCount,
  isInviteState,
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

describe("CLE-19 plain-English invite problems", () => {
  it("tells an expired link holder what to do next", () => {
    expect(
      describeInviteProblem({
        state: "expired",
        companyName: "Coastal Demo Cleaning",
        cleanerCount: 3,
      }),
    ).toBe("This invite link from Coastal Demo Cleaning has expired. Ask them for a new link.");
  });

  it("tells a superseded link holder what to do next", () => {
    expect(
      describeInviteProblem({
        state: "revoked",
        companyName: "Coastal Demo Cleaning",
        cleanerCount: 3,
      }),
    ).toBe(
      "This invite link from Coastal Demo Cleaning is no longer in use. Ask them for a new link.",
    );
  });

  it("does not name a company it could not find", () => {
    expect(
      describeInviteProblem({ state: "unknown", companyName: null, cleanerCount: 0 }),
    ).toBe("We do not know this invite link. Check the link, or ask the company to send it again.");
  });

  it("falls back to a company-free sentence when the name is missing", () => {
    expect(
      describeInviteProblem({ state: "expired", companyName: null, cleanerCount: 0 }),
    ).toBe("This invite link has expired. Ask the company for a new link.");
  });

  it("has nothing to say about a live link", () => {
    expect(
      describeInviteProblem({
        state: "active",
        companyName: "Coastal Demo Cleaning",
        cleanerCount: 3,
      }),
    ).toBe("");
  });
});

describe("CLE-19 join failures", () => {
  it("turns each database refusal into a sentence a cleaner can act on", () => {
    expect(describeJoinFailure("Invite code not found")).toBe(
      "We do not know this invite link. Ask the company to send it again.",
    );
    expect(describeJoinFailure("Invite code is no longer active")).toBe(
      "This invite link is no longer in use. Ask the company for a new link.",
    );
    expect(describeJoinFailure("Invite code has expired")).toBe(
      "This invite link has expired. Ask the company for a new link.",
    );
    expect(describeJoinFailure("Cleaner access required")).toBe(
      "This app is for cleaners. Sign in with your cleaner account.",
    );
    expect(describeJoinFailure("This company removed you from their pool")).toBe(
      "This company removed you. Ask them to add you again.",
    );
  });

  it("never shows a raw database message", () => {
    expect(describeJoinFailure('duplicate key value violates unique constraint "x"')).toBe(
      "We could not add you to this company. Please try again.",
    );
  });
});

describe("CLE-19 cleaner count wording", () => {
  it("counts cleaners in plain words", () => {
    expect(describeCleanerCount(0)).toBe("You would be their first Cleaner staff member.");
    expect(describeCleanerCount(1)).toBe("1 cleaner is already on their staff.");
    expect(describeCleanerCount(7)).toBe("7 cleaners are already on their staff.");
  });
});
