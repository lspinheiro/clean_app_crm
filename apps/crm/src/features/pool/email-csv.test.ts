import { describe, expect, it } from "vitest";

import { parsePoolInviteEmailCsv } from "./email-csv";

describe("CLE-79 cleaner email CSV", () => {
  it("accepts email with an optional name and deduplicates case-insensitively", () => {
    const result = parsePoolInviteEmailCsv(
      "email,name\n Ana@example.com ,Ana Silva\nana@EXAMPLE.com,Duplicate\nbruno@example.com,\n",
    );

    expect(result.fileError).toBeNull();
    expect(result.recipients).toEqual([
      { email: "ana@example.com", name: "Ana Silva" },
      { email: "bruno@example.com", name: null },
    ]);
    expect(result.rows).toEqual([
      expect.objectContaining({ rowNumber: 2, status: "ready" }),
      expect.objectContaining({ rowNumber: 3, status: "duplicate" }),
      expect.objectContaining({ rowNumber: 4, status: "ready" }),
    ]);
  });

  it("reports invalid addresses by row without discarding valid recipients", () => {
    const result = parsePoolInviteEmailCsv(
      "email,name\nnot-an-email,Bad\nvalid@example.com,Valid\n,Missing\n",
    );

    expect(result.recipients).toEqual([
      { email: "valid@example.com", name: "Valid" },
    ]);
    expect(result.rows).toEqual([
      expect.objectContaining({ rowNumber: 2, status: "invalid" }),
      expect.objectContaining({ rowNumber: 3, status: "ready" }),
      expect.objectContaining({ rowNumber: 4, status: "invalid" }),
    ]);
  });

  it("reports an overlong name on its row before confirmation", () => {
    const result = parsePoolInviteEmailCsv(
      `email,name\nana@example.com,${"A".repeat(201)}\nbruno@example.com,Bruno\n`,
    );

    expect(result.recipients).toEqual([
      { email: "bruno@example.com", name: "Bruno" },
    ]);
    expect(result.rows[0]).toMatchObject({
      reason: "Name must be 200 characters or fewer.",
      rowNumber: 2,
      status: "invalid",
    });
  });

  it("marks recipients over the 500-row alpha limit before confirmation", () => {
    const rows = Array.from(
      { length: 501 },
      (_, index) => `cleaner-${index}@example.com,Cleaner ${index}`,
    );
    const result = parsePoolInviteEmailCsv(`email,name\n${rows.join("\n")}\n`);

    expect(result.recipients).toHaveLength(500);
    expect(result.rows[500]).toMatchObject({
      reason: "The alpha limit is 500 recipients per CSV.",
      rowNumber: 502,
      status: "invalid",
    });
  });

  it.each([
    ["email\nana@example.com\n", "Use the exact headers: email,name."],
    ["name,email\nAna,ana@example.com\n", "Use the exact headers: email,name."],
    ["email,name\n", "Add at least one recipient."],
  ])("rejects an invalid file shape", (csv, expectedError) => {
    expect(parsePoolInviteEmailCsv(csv).fileError).toBe(expectedError);
  });
});
