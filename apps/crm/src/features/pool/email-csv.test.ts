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

  it.each([
    ["email\nana@example.com\n", "Use the exact headers: email,name."],
    ["name,email\nAna,ana@example.com\n", "Use the exact headers: email,name."],
    ["email,name\n", "Add at least one recipient."],
  ])("rejects an invalid file shape", (csv, expectedError) => {
    expect(parsePoolInviteEmailCsv(csv).fileError).toBe(expectedError);
  });
});
