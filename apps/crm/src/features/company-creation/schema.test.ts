import { describe, expect, it } from "vitest";

import { parseCompanyCreation } from "./schema";

describe("company creation schema", () => {
  it("trims the company name and canonicalises an 11-digit ABN", () => {
    expect(parseCompanyCreation({
      abn: "53 004 085 616",
      companyName: "  Harbour Services  ",
    })).toEqual({
      data: {
        abn: "53004085616",
        companyName: "Harbour Services",
      },
      fieldErrors: {},
    });
  });

  it("returns field-linked errors for a blank name and malformed ABN", () => {
    const result = parseCompanyCreation({ abn: "123", companyName: "  " });

    expect(result.data).toBeNull();
    expect(result.fieldErrors).toEqual({
      abn: "user.digits11",
      companyName: "user.enterCompanyName",
    });
  });

  it("rejects company names over 120 characters without inventing an ABN checksum", () => {
    expect(parseCompanyCreation({
      abn: "11111111111",
      companyName: "A".repeat(121),
    }).fieldErrors.companyName).toBe("user.max120");

    expect(parseCompanyCreation({
      abn: "11111111111",
      companyName: "Format Only Cleaning",
    }).data).not.toBeNull();
  });
});
