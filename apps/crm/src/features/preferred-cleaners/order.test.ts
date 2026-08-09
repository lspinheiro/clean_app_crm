import { describe, expect, it } from "vitest";

import { moveCleaner, removeCleaner } from "./order";

describe("preferred cleaner ordering", () => {
  it("moves one cleaner without changing the rest of the complete order", () => {
    expect(moveCleaner(["maria", "ana", "juliana"], "juliana", "up")).toEqual([
      "maria",
      "juliana",
      "ana",
    ]);
  });

  it("keeps edge moves stable", () => {
    const order = ["maria", "ana", "juliana"];
    expect(moveCleaner(order, "maria", "up")).toBe(order);
    expect(moveCleaner(order, "juliana", "down")).toBe(order);
  });

  it("removes a cleaner so the remaining array has no rank gap", () => {
    expect(removeCleaner(["maria", "ana", "juliana"], "ana")).toEqual([
      "maria",
      "juliana",
    ]);
  });
});
