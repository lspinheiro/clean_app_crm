import { describe, expect, it } from "vitest";

import { formatNamedCoverage, formatRecurrence } from "./format";

describe("recurring assignment labels", () => {
  it("makes fortnightly cadence and open crew slots explicit", () => {
    expect(formatRecurrence({ frequency: "fortnightly", weekday: 2 })).toBe(
      "Every second Tue",
    );
    expect(
      formatNamedCoverage({
        crewSize: 2,
        namedCleaners: [{ id: "cleaner-a", name: "Maria Santos", slotNumber: 1 }],
      }),
    ).toBe("Maria Santos + 1 open");
  });
});
