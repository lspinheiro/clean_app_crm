import { describe, expect, it } from "vitest";

import { parsePostingRows } from "./model";

const row = {
  application_cap: 10,
  application_count: 4,
  closing_reason: null,
  code: "AB12CD34EF56GH78",
  company_id: "10000000-0000-4000-8000-000000000010",
  created_at: "2026-08-30T01:00:00Z",
  created_by: "10000000-0000-4000-8000-000000000001",
  expires_at: null,
  id: "59000000-0000-4000-8000-000000000501",
  intent: "one_time",
  job_id: "22000000-0000-4000-8000-000000000501",
  public_description: "Cover one hotel clean.",
  recurring_assignment_id: null,
  revoked_at: null,
  state: "active",
};

describe("CLE-60 posting read boundary", () => {
  it("maps the database dead state to a closed posting with its reason", () => {
    expect(parsePostingRows([{ ...row, closing_reason: "filled", state: "dead" }]))
      .toEqual([expect.objectContaining({ closingReason: "filled", state: "closed" })]);
  });

  it.each(["unknown_reason", "regenerated", ""])(
    "rejects unsupported closing reason %s",
    (closingReason) => {
      expect(() => parsePostingRows([{ ...row, closing_reason: closingReason, state: "dead" }]))
        .toThrow("Posting data did not match the database contract");
    },
  );
});
