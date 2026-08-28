import { describe, expect, it } from "vitest";

import { grantsFullCompanyControl, roleAccessMessageKey } from "./role-access";

// CLE-101. The confirmation before an owner invitation and the line that explains each role
// both hang off the delivered permission matrix, not off the literal string "owner", so
// neither can promise access the app does not grant.
describe("CLE-101 role access is read off the permission matrix", () => {
  it("treats owner as full company control", () => {
    expect(grantsFullCompanyControl("owner")).toBe(true);
  });

  it("does not treat staff as full company control", () => {
    expect(grantsFullCompanyControl("staff")).toBe(false);
  });

  it("names the explanation each role is described by", () => {
    expect(roleAccessMessageKey("owner")).toBe("ownerAccess");
    expect(roleAccessMessageKey("staff")).toBe("staffAccess");
  });
});
