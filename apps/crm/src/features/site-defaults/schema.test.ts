import { describe, expect, it } from "vitest";

import { updateSiteSchema } from "./schema";

const validInput = {
  clientId: "10000000-0000-4000-8000-000000000301",
  siteId: "10000000-0000-4000-8000-000000000401",
  name: "Broadbeach Towers",
  address: "10 Surf Parade",
  suburb: "Broadbeach",
  accessNotes: "",
  defaultServiceId: "30000000-0000-4000-8000-000000000001",
  durationHours: "2.5",
  rateAud: "165.50",
};

describe("site defaults trust boundary", () => {
  it("converts hours and AUD to integer persistence units", () => {
    const result = updateSiteSchema.parse(validInput);

    expect(result.durationMinutes).toBe(150);
    expect(result.rateCents).toBe(16_550);
    expect(result.accessNotes).toBeNull();
  });

  it("rejects non-positive defaults and rates with excess decimal precision", () => {
    expect(
      updateSiteSchema.safeParse({ ...validInput, durationHours: "0", rateAud: "12.345" })
        .success,
    ).toBe(false);
  });
});
