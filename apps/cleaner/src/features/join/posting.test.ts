import { describe, expect, it } from "vitest";

import { parsePostingPreview, parseVisitorRelationship } from "./posting";

const coastalId = "10000000-0000-4000-8000-000000000001";
const harbourId = "20000000-0000-4000-8000-000000000002";
const sharedName = "Shared Cleaning Name";

describe("CLE-61 posting preview boundary", () => {
  it("keeps only public posting fields when the response is wider than the contract", () => {
    const posting = parsePostingPreview({
      access_notes: "Gate code 2468",
      address: "14 Ocean Avenue, Southport",
      cleaner_pay_cents: 14000,
      client_charge_cents: 22000,
      company_id: coastalId,
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

describe("CLE-111 company identity in the posting preview", () => {
  it("carries the company id so a relationship can be matched by identity", () => {
    const posting = parsePostingPreview({
      company_id: coastalId,
      company_name: "Coastal Demo Cleaning",
      intent: "expression_of_interest",
      public_description: "Join our trusted cleaner staff.",
      state: "active",
    });

    expect(posting).toMatchObject({ companyId: coastalId, state: "active" });
  });
});

describe("CLE-111 visitor relationship matching", () => {
  it("lets a cleaner rejected by one company apply to a same-named other company", () => {
    expect(parseVisitorRelationship(
      [{
        company_id: coastalId,
        company_name: sharedName,
        join_request_state: "rejected",
      }],
      [],
      harbourId,
    )).toBe("none");
  });

  it("keeps the rejection on the posting of the company that rejected her", () => {
    expect(parseVisitorRelationship(
      [{
        company_id: coastalId,
        company_name: sharedName,
        join_request_state: "rejected",
      }],
      [],
      coastalId,
    )).toBe("rejected");
  });

  it("does not read staff at a same-named company as staff here", () => {
    expect(parseVisitorRelationship(
      [],
      [{
        company_id: harbourId,
        company_name: sharedName,
        status: "active",
      }],
      coastalId,
    )).toBe("none");
  });

  it("resolves rows at two same-named companies to the one whose posting is open", () => {
    expect(parseVisitorRelationship(
      [{
        company_id: coastalId,
        company_name: sharedName,
        join_request_state: "rejected",
      }],
      [{
        company_id: harbourId,
        company_name: sharedName,
        status: "active",
      }],
      coastalId,
    )).toBe("rejected");
  });
});
