import { describe, expect, it } from "vitest";

import {
  formatCleanerPay,
  formatJobDate,
  formatJobDuration,
  formatJobStatus,
  formatJobTime,
} from "./format";

describe("job formatting", () => {
  it("uses Brisbane time, tabular-friendly units, and canonical status labels", () => {
    expect(formatJobDate("2026-08-09T22:00:00Z")).toBe("Mon, 10 Aug");
    expect(formatJobTime("2026-08-09T22:00:00Z")).toBe("8:00 am");
    expect(formatJobDuration(150)).toBe("2 h 30 min");
    expect(formatCleanerPay(12000)).toBe("$120");
    expect(formatJobStatus("on_the_way")).toBe("On the way");
  });
});
