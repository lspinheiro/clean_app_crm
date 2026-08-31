import { describe, expect, it } from "vitest";

import {
  joinFailureKey,
  normaliseInviteCode,
} from "./invite";

describe("CLE-19 invite code handling", () => {
  it("upper-cases and trims a code pasted from a chat message", () => {
    expect(normaliseInviteCode("  clean1demojoin99 ")).toBe("CLEAN1DEMOJOIN99");
  });
});

describe("CLE-19 join failures", () => {
  it("turns each database refusal into a sentence a cleaner can act on", () => {
    expect(joinFailureKey("Invite code not found")).toBe("joinUnknown");
    expect(joinFailureKey("Invite code is no longer active")).toBe("joinInactive");
    expect(joinFailureKey("Invite code has expired")).toBe("joinExpired");
    expect(joinFailureKey("Cleaner access required")).toBe("cleanerAccessRequired");
    expect(joinFailureKey("This company removed you from their pool")).toBe("removed");
    expect(joinFailureKey("Already on this company's cleaner staff")).toBe("alreadyStaff");
    expect(joinFailureKey("Cleaner can apply only once per job")).toBe("alreadyApplied");
    expect(joinFailureKey("Cleaner can apply only once per recurring assignment")).toBe(
      "alreadyApplied",
    );
    expect(
      joinFailureKey("Regular posting applications are not available to existing cleaner staff"),
    ).toBe("alreadyStaff");
  });

  it("never shows a raw database message", () => {
    expect(joinFailureKey('duplicate key value violates unique constraint "x"')).toBe("joinError");
  });
});
