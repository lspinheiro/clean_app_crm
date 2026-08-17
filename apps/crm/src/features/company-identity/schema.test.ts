import { describe, expect, it } from "vitest";

import { parseCompanyIdentity } from "./schema";

describe("company identity validation", () => {
  it("trims the name and stores an ABN as canonical digits", () => {
    expect(
      parseCompanyIdentity({ name: "  Coastal Cleaning  ", abn: "51 824 753 556" }),
    ).toEqual({
      data: { name: "Coastal Cleaning", abn: "51824753556" },
      fieldErrors: {},
    });
  });

  it("returns field-linked errors for a blank name and malformed ABN", () => {
    const result = parseCompanyIdentity({ name: "   ", abn: "51A" });

    expect(result.data).toBeNull();
    expect(result.fieldErrors).toEqual({
      name: "user.enterCompanyName",
      abn: "user.digits11",
    });
  });

  it("deliberately performs format validation without an ABN checksum lookup", () => {
    expect(parseCompanyIdentity({ name: "Demo", abn: "12345678901" }).data).toEqual({
      name: "Demo",
      abn: "12345678901",
    });
  });
});
