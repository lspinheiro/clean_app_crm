import { describe, expect, it } from "vitest";

import {
  describeOpenSlots,
  formatCleanerPay,
  formatJobDate,
  formatJobDuration,
  formatJobTime,
} from "./format";

describe("CLE-20 board formatting", () => {
  it("reads times in Brisbane, even when that lands on the next day", () => {
    // 20:00 UTC is 06:00 the following morning in Brisbane (UTC+10, no DST).
    expect(formatJobDate("2026-08-19T20:00:00+00:00")).toContain("20 Aug");
    expect(formatJobTime("2026-08-19T20:00:00+00:00")).toBe("6:00 am");
  });

  it("writes the time the way the design contract asks", () => {
    expect(formatJobTime("2026-08-19T22:30:00+00:00")).toBe("8:30 am");
    expect(formatJobTime("2026-08-20T04:00:00+00:00")).toBe("2:00 pm");
  });

  it("writes durations in plain words", () => {
    expect(formatJobDuration(45)).toBe("45 min");
    expect(formatJobDuration(60)).toBe("1 h");
    expect(formatJobDuration(90)).toBe("1 h 30 min");
    expect(formatJobDuration(150)).toBe("2 h 30 min");
  });

  it("shows pay in AUD, hiding cents when there are none", () => {
    expect(formatCleanerPay(9000)).toBe("$90");
    expect(formatCleanerPay(9050)).toBe("$90.50");
    expect(formatCleanerPay(18000)).toBe("$180");
  });

  it("localises presentation while keeping Brisbane time and AUD", () => {
    const instant = "2026-08-19T20:00:00+00:00";

    expect(formatJobDate(instant, "pt-BR")).toContain("20 de ago");
    expect(formatJobTime(instant, "pt-BR")).toBe("06:00");
    expect(formatCleanerPay(9050, "pt-BR")).toMatch(/90,50/);
    expect(formatJobDuration(90, "pt-BR")).toBe("1 h 30 min");
  });
});

describe("CLE-20 crew slot wording", () => {
  it("shows the one remaining spot on a one-cleaner job", () => {
    expect(describeOpenSlots(1, 1)).toBe("1 spot open");
  });

  it("says how many spots a crew job still has open", () => {
    expect(describeOpenSlots(2, 2)).toBe("2 of 2 spots open");
    expect(describeOpenSlots(1, 2)).toBe("1 of 2 spots open");
    expect(describeOpenSlots(2, 3)).toBe("2 of 3 spots open");
  });

  it("localises crew wording", () => {
    expect(describeOpenSlots(1, 2, "pt-BR")).toBe("1 de 2 vagas abertas");
    expect(describeOpenSlots(2, 3, "pt-BR")).toBe("2 de 3 vagas abertas");
  });
});
