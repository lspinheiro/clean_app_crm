import { describe, expect, it } from "vitest";

import { recurringAssignmentSchema } from "./schema";

const validInput = {
  clientId: "10000000-0000-4000-8000-000000000301",
  siteId: "10000000-0000-4000-8000-000000000401",
  recurringAssignmentId: "",
  serviceId: "30000000-0000-4000-8000-000000000002",
  frequency: "fortnightly",
  anchorDate: "2026-08-11",
  startTime: "08:15",
  durationHours: "2.5",
  cleanerPayAud: "120.50",
  crewSize: "2",
  cleanerIds: ["10000000-0000-4000-8000-000000000002", ""],
};

describe("recurring assignment trust boundary", () => {
  it("derives the ISO weekday and integer persistence units", () => {
    const result = recurringAssignmentSchema.parse(validInput);

    expect(result).toMatchObject({
      recurringAssignmentId: undefined,
      weekday: 2,
      durationMinutes: 150,
      cleanerPayCents: 12_050,
      crewSize: 2,
      cleanerIds: ["10000000-0000-4000-8000-000000000002"],
    });
  });

  it("rejects duplicate or over-capacity named cleaners", () => {
    const cleanerId = "10000000-0000-4000-8000-000000000002";

    expect(
      recurringAssignmentSchema.safeParse({
        ...validInput,
        crewSize: "1",
        cleanerIds: [cleanerId, cleanerId],
      }).success,
    ).toBe(false);
    expect(
      recurringAssignmentSchema.safeParse({
        ...validInput,
        crewSize: "1",
        cleanerIds: [
          cleanerId,
          "10000000-0000-4000-8000-000000000003",
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects sparse named slots instead of silently renumbering them", () => {
    expect(
      recurringAssignmentSchema.safeParse({
        ...validInput,
        cleanerIds: ["", "10000000-0000-4000-8000-000000000003"],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid dates, times, durations, pay, and crew size", () => {
    expect(
      recurringAssignmentSchema.safeParse({
        ...validInput,
        anchorDate: "2026-02-30",
        startTime: "25:00",
        durationHours: "0",
        cleanerPayAud: "12.345",
        crewSize: "0",
      }).success,
    ).toBe(false);
  });
});
