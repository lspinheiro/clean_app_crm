import { describe, expect, it } from "vitest";

import { describeAccessError, toMapsUrl } from "./access";

describe("CLE-24 the maps handoff", () => {
  it("builds a universal https link rather than a platform scheme", () => {
    // A geo: URI is ignored by iOS Safari, and an https link keeps working inside the
    // Capacitor shell ADR 0004 leaves open.
    expect(toMapsUrl("12 Bayview Rd, Robina QLD 4226")).toBe(
      "https://www.google.com/maps/search/?api=1&query=12%20Bayview%20Rd%2C%20Robina%20QLD%204226",
    );
  });

  it("encodes an address containing characters that would break the query", () => {
    expect(toMapsUrl("Unit 3/12 O'Hara & Sons Ln")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Unit%203%2F12%20O'Hara%20%26%20Sons%20Ln",
    );
  });
});

describe("CLE-24 access errors read as plain English", () => {
  it("explains an address she may no longer see", () => {
    expect(describeAccessError({ message: "Job access is unavailable" })).toBe(
      "We cannot show the address for this job any more.",
    );
  });

  it("never leaks a raw database message", () => {
    expect(describeAccessError({ message: 'permission denied for table "sites"' })).toBe(
      "We could not load the address. Try again.",
    );
  });

  it("copes with an error carrying no message at all", () => {
    expect(describeAccessError(null)).toBe("We could not load the address. Try again.");
  });
});
