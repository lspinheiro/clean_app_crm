import { describe, expect, it } from "vitest";

import { parsePostingPreview, parseVisitorRelationship } from "./posting";

describe("CLE-61 posting preview boundary", () => {
  it("keeps only public posting fields when the response is wider than the contract", () => {
    const posting = parsePostingPreview({
      access_notes: "Gate code 2468",
      address: "14 Ocean Avenue, Southport",
      cleaner_pay_cents: 14000,
      client_charge_cents: 22000,
      company_name: "Coastal Demo Cleaning",
      duration_minutes: 120,
      intent: "one_time",
      internal_notes: "Do not show candidates",
      public_description: "A one-off office clean with an established crew.",
      scheduled_start: "2026-09-07T23:30:00.000Z",
      service_name: "Office cleaning",
      service_slug: "office-cleaning",
      state: "active",
      suburb: "Southport",
    });

    expect(posting.state).toBe("active");
    expect(Object.keys(posting)).not.toEqual(expect.arrayContaining([
      "access_notes",
      "address",
      "client_charge_cents",
      "internal_notes",
    ]));
  });
});

describe("CLE-61 visitor relationship matching", () => {
  it("returns none when one company name spans more than one company id", () => {
    expect(parseVisitorRelationship(
      [{
        company_id: "10000000-0000-4000-8000-000000000001",
        company_name: "Shared Cleaning Name",
        join_request_state: "rejected",
      }],
      [{
        company_id: "20000000-0000-4000-8000-000000000002",
        company_name: "Shared Cleaning Name",
        status: "active",
      }],
      "Shared Cleaning Name",
    )).toBe("none");
  });
});
