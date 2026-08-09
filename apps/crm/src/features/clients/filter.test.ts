import { describe, expect, it } from "vitest";

import { filterClients } from "./filter";
import type { ClientWithSites } from "./types";

const clients: ClientWithSites[] = [
  {
    id: "client-1",
    name: "Oceanview Property Group",
    contactName: null,
    phone: null,
    notes: null,
    sites: [
      {
        id: "site-1",
        clientId: "client-1",
        name: "Broadbeach Towers",
        address: "10 Surf Parade",
        suburb: "Broadbeach",
        accessNotes: null,
        defaultService: null,
        defaultDurationMinutes: null,
        defaultRateCents: null,
      },
      {
        id: "site-2",
        clientId: "client-1",
        name: "Southport Office",
        address: "45 Nerang Street",
        suburb: "Southport",
        accessNotes: null,
        defaultService: null,
        defaultDurationMinutes: null,
        defaultRateCents: null,
      },
    ],
  },
  {
    id: "client-2",
    name: "Palm Grove Dental",
    contactName: null,
    phone: null,
    notes: null,
    sites: [],
  },
];

describe("client and site search", () => {
  it("returns every site when the client name matches", () => {
    const result = filterClients(clients, "  OCEANVIEW ");

    expect(result).toHaveLength(1);
    expect(result[0].sites).toHaveLength(2);
  });

  it("returns the owning client with only matching sites for a site-name match", () => {
    const result = filterClients(clients, "southport office");

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Oceanview Property Group");
    expect(result[0].sites.map((site) => site.name)).toEqual(["Southport Office"]);
  });

  it("restores all clients for an empty search", () => {
    expect(filterClients(clients, "   ")).toBe(clients);
  });
});
