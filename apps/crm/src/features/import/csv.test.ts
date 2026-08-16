import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseClientImportCsv,
  parseSiteImportCsv,
  serialiseImportRows,
} from "./csv";

describe("CLE-71 CSV contract", () => {
  it("ships templates with the exact published headers", () => {
    expect(
      readFileSync(
        resolve(process.cwd(), "public/templates/clients-import.csv"),
        "utf8",
      ),
    ).toBe("name,contact_name,phone,notes\n");
    expect(
      readFileSync(
        resolve(process.cwd(), "public/templates/sites-import.csv"),
        "utf8",
      ),
    ).toBe("client_name,name,address,suburb,access_notes\n");
  });

  it("parses quoted client fields and marks invalid and repeated rows before import", () => {
    const preview = parseClientImportCsv(
      [
        "\ufeffname,contact_name,phone,notes",
        "\"North, Corp\",\"A \"\"quoted\"\" contact\",07 5555 0101,\"First line\nSecond line\"",
        ",Missing Name,,",
        " oceanview property group ,,,",
        "\"NORTH, CORP\",,,",
      ].join("\r\n"),
      ["Oceanview Property Group"],
    );

    expect(preview.fileError).toBeNull();
    expect(preview.rows).toEqual([
      {
        rowNumber: 2,
        state: "ready",
        values: {
          name: "North, Corp",
          contactName: "A \"quoted\" contact",
          phone: "07 5555 0101",
          notes: "First line\nSecond line",
        },
        actionInput: {
          name: "North, Corp",
          contactName: "A \"quoted\" contact",
          phone: "07 5555 0101",
          notes: "First line\nSecond line",
        },
      },
      expect.objectContaining({
        rowNumber: 3,
        state: "invalid",
        reason: "Enter a client name.",
      }),
      expect.objectContaining({
        rowNumber: 4,
        state: "duplicate",
        reason: "A client named Oceanview Property Group already exists.",
      }),
      expect.objectContaining({
        rowNumber: 5,
        state: "duplicate",
        reason: "A client named North, Corp is already in this file.",
      }),
    ]);
  });

  it("rejects a client file whose published columns do not match", () => {
    expect(parseClientImportCsv("name,phone\nOceanview,123", [])).toEqual({
      fileError:
        "Use the client template columns: name, contact_name, phone, notes.",
      rows: [],
    });
  });

  it("resolves site clients, scopes duplicates to their client, and rejects unknown clients", () => {
    const preview = parseSiteImportCsv(
      [
        "client_name,name,address,suburb,access_notes",
        "Oceanview Property Group,Broadbeach Towers,10 Surf Parade,Broadbeach,Call reception",
        "Harbour Offices,Broadbeach Towers,20 Marine Parade,Southport,",
        "Missing Client,Warehouse,1 Test Street,Robina,",
      ].join("\n"),
      [
        {
          id: "10000000-0000-4000-8000-000000000301",
          name: "Oceanview Property Group",
          siteNames: ["Broadbeach Towers"],
        },
        {
          id: "10000000-0000-4000-8000-000000000302",
          name: "Harbour Offices",
          siteNames: [],
        },
      ],
    );

    expect(preview.rows[0]).toEqual(
      expect.objectContaining({
        state: "duplicate",
        reason: "Broadbeach Towers already exists for Oceanview Property Group.",
      }),
    );
    expect(preview.rows[1]).toEqual({
      rowNumber: 3,
      state: "ready",
      values: {
        clientName: "Harbour Offices",
        name: "Broadbeach Towers",
        address: "20 Marine Parade",
        suburb: "Southport",
        accessNotes: "",
      },
      actionInput: {
        clientId: "10000000-0000-4000-8000-000000000302",
        name: "Broadbeach Towers",
        address: "20 Marine Parade",
        suburb: "Southport",
        accessNotes: "",
      },
    });
    expect(preview.rows[2]).toEqual(
      expect.objectContaining({
        state: "invalid",
        reason: "No client named Missing Client exists.",
      }),
    );
  });

  it("serialises failed values with the published headers and safe CSV quoting", () => {
    expect(
      serialiseImportRows("clients", [
        {
          name: "North, Corp",
          contactName: "A \"quoted\" contact",
          phone: "",
          notes: "First line\nSecond line",
        },
      ]),
    ).toBe(
      "name,contact_name,phone,notes\r\n\"North, Corp\",\"A \"\"quoted\"\" contact\",,\"First line\nSecond line\"\r\n",
    );
  });
});
