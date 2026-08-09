import { describe, expect, it } from "vitest";

import {
  addDays,
  buildRosterDays,
  formatRosterTime,
  getBrisbaneDateKey,
  getRosterWeekBounds,
  normaliseWeekStart,
  parseRosterView,
  parseRosterWeek,
  rosterHref,
} from "./calendar";

describe("roster calendar", () => {
  it("uses Brisbane's new day across the UTC Sunday boundary", () => {
    expect(getBrisbaneDateKey(new Date("2026-08-09T14:01:00Z"))).toBe("2026-08-10");
  });

  it("normalises valid dates to Monday and rejects malformed dates", () => {
    expect(normaliseWeekStart("2026-08-12")).toBe("2026-08-10");
    expect(normaliseWeekStart("2026-02-30")).toBeNull();
    expect(parseRosterWeek("bad", new Date("2026-08-09T14:01:00Z"))).toBe("2026-08-10");
  });

  it("builds seven dated headers and exact Brisbane week bounds", () => {
    expect(buildRosterDays("2026-08-10")).toEqual([
      { dateKey: "2026-08-10", headerLabel: "Mon 10" },
      { dateKey: "2026-08-11", headerLabel: "Tue 11" },
      { dateKey: "2026-08-12", headerLabel: "Wed 12" },
      { dateKey: "2026-08-13", headerLabel: "Thu 13" },
      { dateKey: "2026-08-14", headerLabel: "Fri 14" },
      { dateKey: "2026-08-15", headerLabel: "Sat 15" },
      { dateKey: "2026-08-16", headerLabel: "Sun 16" },
    ]);
    expect(getRosterWeekBounds("2026-08-10")).toEqual({
      startsAt: "2026-08-09T14:00:00.000Z",
      endsAt: "2026-08-16T14:00:00.000Z",
    });
  });

  it("preserves week selection in navigation and formats Brisbane times", () => {
    expect(addDays("2026-08-10", 7)).toBe("2026-08-17");
    expect(rosterHref("2026-08-17")).toBe("/roster?week=2026-08-17");
    expect(rosterHref("2026-08-17", "site")).toBe(
      "/roster?week=2026-08-17&view=site",
    );
    expect(parseRosterView("unknown")).toBe("cleaner");
    expect(parseRosterView("site")).toBe("site");
    expect(formatRosterTime("2026-08-09T22:00:00Z")).toBe("8:00");
  });
});
