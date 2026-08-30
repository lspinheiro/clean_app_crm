import { describe, expect, it } from "vitest";

import { formatNamedCoverage, formatRecurrence } from "./format";

describe("recurring assignment labels", () => {
  const labels = {
    everyFortnight: (weekday: string) => `Every second ${weekday}`,
    everyWeek: (weekday: string) => `Every ${weekday}`,
    openSlots: (count: number) => `${count} open`,
    weekday: (day: number) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day],
  };

  it("makes fortnightly cadence and open crew slots explicit", () => {
    expect(formatRecurrence({ frequency: "fortnightly", weekday: 2 }, labels)).toBe(
      "Every second Tue",
    );
    expect(
      formatNamedCoverage({
        crewSize: 2,
        namedCleaners: [{
          id: "cleaner-a",
          name: "Maria Santos",
          slotNumber: 1,
          consentState: { status: "accepted" },
        }],
      }, labels),
    ).toBe("Maria Santos + 1 open");

    expect(formatRecurrence({ frequency: "weekly", weekday: 2 }, {
      ...labels,
      everyWeek: (weekday) => `Repete semanalmente: ${weekday}`,
      weekday: () => "terça-feira",
    })).toBe("Repete semanalmente: terça-feira");
  });

  it("uses catalogue-owned weekday, cadence, and plural labels", () => {
    const labels = {
      everyFortnight: (weekday: string) => `fortnight:${weekday}`,
      everyWeek: (weekday: string) => `week:${weekday}`,
      openSlots: (count: number) => `open:${count}`,
      weekday: (day: number) => `day:${day}`,
    };
    expect(formatRecurrence({ frequency: "weekly", weekday: 2 }, labels)).toBe("week:day:2");
    expect(
      formatNamedCoverage(
        {
          crewSize: 2,
          namedCleaners: [{
            id: "cleaner-a",
            name: "Maria",
            slotNumber: 1,
            consentState: { status: "accepted" },
          }],
        },
        labels,
      ),
    ).toBe("Maria + open:1");
  });
});
