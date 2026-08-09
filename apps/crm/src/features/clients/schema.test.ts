import { describe, expect, it } from "vitest";

import { createClientSchema, createSiteSchema } from "./schema";

describe("client and site create boundaries", () => {
  it("normalises blank optional client fields to null", () => {
    expect(
      createClientSchema.parse({ name: "  Oceanview  ", contactName: " ", phone: "", notes: "  " }),
    ).toEqual({ name: "Oceanview", contactName: null, phone: null, notes: null });
  });

  it("requires a name, address, and suburb for a site", () => {
    const result = createSiteSchema.safeParse({
      clientId: "10000000-0000-4000-8000-000000000301",
      name: "",
      address: "",
      suburb: "",
      accessNotes: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual([
        "name",
        "address",
        "suburb",
      ]);
    }
  });
});
