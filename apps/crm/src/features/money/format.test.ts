import { describe, expect, it } from "vitest";

import {
  formatMoneyAmount,
  formatMoneyJobDate,
  formatMoneyJobTime,
  formatMoneyStatus,
} from "./format";

describe("Money labels", () => {
  it("formats AUD precisely and schedules in Brisbane time", () => {
    expect(formatMoneyAmount(12000)).toBe("$120.00");
    expect(formatMoneyAmount(12050)).toBe("$120.50");
    expect(formatMoneyJobDate("2026-08-07T22:00:00Z")).toBe("8 Aug 2026");
    expect(formatMoneyJobTime("2026-08-07T22:00:00Z")).toBe("8:00 am");
  });

  it("uses explicit settlement labels", () => {
    expect(formatMoneyStatus("owed")).toBe("Owed");
    expect(formatMoneyStatus("paid")).toBe("Paid");
  });

  it("uses Brazilian presentation without changing AUD or Brisbane time", () => {
    expect(formatMoneyAmount(12_050, "pt-BR")).toBe("AU$\u00a0120,50");
    expect(formatMoneyJobDate("2026-08-07T22:00:00Z", "pt-BR")).toBe(
      "8 de ago. de 2026",
    );
    expect(formatMoneyJobTime("2026-08-07T22:00:00Z", "pt-BR")).toBe("08:00");
  });
});
