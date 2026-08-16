import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createSite: vi.fn(),
}));

vi.mock("@/app/actions/clients", () => ({
  createClient: mocks.createClient,
  createSite: mocks.createSite,
}));

import { importClientRow, importSiteRow } from "./import";

const success = { ok: true, fieldErrors: {}, formError: null };

describe("CLE-71 import action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(success);
    mocks.createSite.mockResolvedValue(success);
  });

  it("validates and delegates a client row to the existing create action", async () => {
    await expect(
      importClientRow({
        name: "  North, Corp  ",
        contactName: " Morgan ",
        phone: " 07 5555 0101 ",
        notes: " ",
      }),
    ).resolves.toEqual(success);

    const formData = mocks.createClient.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData.entries())).toEqual({
      name: "North, Corp",
      contactName: "Morgan",
      phone: "07 5555 0101",
      notes: "",
    });
  });

  it("rejects malformed rows without calling a create action", async () => {
    const result = await importSiteRow({
      clientId: "not-a-client",
      name: "",
      address: "",
      suburb: "",
      accessNotes: "",
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors).toMatchObject({
      clientId: "Choose a valid client.",
      name: "Enter a site name.",
      address: "Enter a street address.",
      suburb: "Enter a suburb.",
    });
    expect(mocks.createSite).not.toHaveBeenCalled();
  });

  it("delegates a resolved site row to the existing create action", async () => {
    await expect(
      importSiteRow({
        clientId: "10000000-0000-4000-8000-000000000301",
        name: "Broadbeach Towers",
        address: "10 Surf Parade",
        suburb: "Broadbeach",
        accessNotes: "Call reception",
      }),
    ).resolves.toEqual(success);

    const formData = mocks.createSite.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData.entries())).toEqual({
      clientId: "10000000-0000-4000-8000-000000000301",
      name: "Broadbeach Towers",
      address: "10 Surf Parade",
      suburb: "Broadbeach",
      accessNotes: "Call reception",
    });
  });
});
