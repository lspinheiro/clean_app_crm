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
      name: "Enter a company name.",
      abn: "Enter exactly 11 digits.",
    });
  });

  it("deliberately performs format validation without an ABN checksum lookup", () => {
    expect(parseCompanyIdentity({ name: "Demo", abn: "12345678901" }).data).toEqual({
      name: "Demo",
      abn: "12345678901",
    });
  });
});
