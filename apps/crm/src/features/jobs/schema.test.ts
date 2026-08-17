import { describe, expect, it } from "vitest";

import { oneOffJobSchema } from "./schema";

const validInput = {
  clientId: "10000000-0000-4000-8000-000000000301",
  siteId: "10000000-0000-4000-8000-000000000401",
  serviceId: "30000000-0000-4000-8000-000000000002",
  date: "2026-08-19",
  startTime: "08:30",
  durationHours: "2.5",
  cleanerPayAud: "150.75",
  clientChargeAud: "420.00",
  crewSize: "2",
  notes: "  Focus on the kitchen  ",
  mode: "post",
};

describe("CLE-23 one-off job validation", () => {
  it("normalises the editable form values into the database contract", () => {
    const parsed = oneOffJobSchema.parse(validInput);

    expect(parsed).toMatchObject({
      durationMinutes: 150,
      cleanerPayCents: 15075,
      clientChargeCents: 42000,
      crewSize: 2,
      notes: "Focus on the kitchen",
      postNow: true,
    });
  });

  it("keeps optional admin-only fields nullable", () => {
    const parsed = oneOffJobSchema.parse({
      ...validInput,
      clientChargeAud: "",
      notes: "",
      mode: "draft",
    });

    expect(parsed.clientChargeCents).toBeNull();
    expect(parsed.notes).toBeNull();
    expect(parsed.postNow).toBe(false);
  });

  it.each([
    ["clientId", ""],
    ["siteId", ""],
    ["serviceId", ""],
    ["date", "2026-02-30"],
    ["startTime", "25:00"],
    ["durationHours", "0"],
    ["durationHours", "0.001"],
    ["cleanerPayAud", "0"],
    ["clientChargeAud", "-1"],
    ["crewSize", "0"],
  ])("rejects an invalid %s before authentication", (field, value) => {
    const parsed = oneOffJobSchema.safeParse({ ...validInput, [field]: value });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path[0] === field)).toBe(true);
    }
  });

  it("guides a missing client before validating its disabled site field", () => {
    const parsed = oneOffJobSchema.safeParse({
      ...validInput,
      clientId: "",
      siteId: "",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["clientId"],
            message: "user.chooseClient",
          }),
        ]),
      );
      expect(parsed.error.issues.some((issue) => issue.path[0] === "siteId"))
        .toBe(false);
    }
  });
});
