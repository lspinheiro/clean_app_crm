import { describe, expect, it } from "vitest";

import { formatSiteDefaults } from "./format";

describe("site default formatting", () => {
  it("gets the empty-state label from the active catalogue", () => {
    const site = {
      accessNotes: null,
      address: "10 Surf Parade",
      clientId: "client-1",
      defaultDurationMinutes: null,
      defaultRateCents: null,
      defaultService: null,
      id: "site-1",
      name: "Broadbeach Towers",
      preferredCleaners: [],
      suburb: "Broadbeach",
    };
    expect(formatSiteDefaults(site, "en-AU", "catalogue:defaults")).toBe("catalogue:defaults");
  });
});
