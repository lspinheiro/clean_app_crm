import { describe, expect, it } from "vitest";

import { accessErrorKey, toMapsUrl } from "./access";

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

describe("CLE-24 access errors map to safe UI keys", () => {
  it("explains an address she may no longer see", () => {
    expect(accessErrorKey({ message: "Job access is unavailable" })).toBe("errorAddressUnavailable");
  });

  it("never leaks a raw database message", () => {
    expect(accessErrorKey({ message: 'permission denied for table "sites"' })).toBe("errorAddress");
  });

  it("copes with an error carrying no message at all", () => {
    expect(accessErrorKey(null)).toBe("errorAddress");
  });
});
