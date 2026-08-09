import { describe, expect, it } from "vitest";

import { formatAud, formatDuration } from "./format";

describe("site default formatting", () => {
  it("renders integer cents as AUD with tabular-friendly decimals", () => {
    expect(formatAud(16_550)).toBe("$165.50");
  });

  it("renders duration minutes as compact hours", () => {
    expect(formatDuration(150)).toBe("2.5 h");
    expect(formatDuration(120)).toBe("2 h");
  });
});
