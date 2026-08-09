import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  reloadCurrentPage: vi.fn(),
  savePreferredCleanerOrder: vi.fn(),
  updateClient: vi.fn(),
  updateSite: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/clients", () => ({
  savePreferredCleanerOrder: mocks.savePreferredCleanerOrder,
  updateClient: mocks.updateClient,
  updateSite: mocks.updateSite,
}));
vi.mock("@/lib/reload-page", () => ({
  reloadCurrentPage: mocks.reloadCurrentPage,
}));

import { ClientDetailWorkspace } from "./client-detail-workspace";

const siteId = "10000000-0000-4000-8000-000000000401";
const client = {
  id: "10000000-0000-4000-8000-000000000301",
  name: "Oceanview Property Group",
  contactName: "Morgan Ellis",
  phone: "07 5555 0101",
  notes: null,
  sites: [
    {
      id: siteId,
      clientId: "10000000-0000-4000-8000-000000000301",
      name: "Broadbeach Towers",
      address: "10 Surf Parade",
      suburb: "Broadbeach",
      accessNotes: null,
      defaultService: { id: "service-1", name: "Standard clean" },
      defaultDurationMinutes: 120,
      defaultRateCents: 15000,
      preferredCleaners: [
        { id: "cleaner-a", name: "Cleaner A", rank: 1 },
        { id: "cleaner-b", name: "Cleaner B", rank: 2 },
      ],
    },
  ],
};

describe("CLE-9 preferred-cleaner reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps controls locked and does not restore stale order after an indeterminate save", async () => {
    mocks.savePreferredCleanerOrder.mockRejectedValue(new Error("response lost"));
    const user = userEvent.setup();
    render(
      <ClientDetailWorkspace
        client={client}
        poolCleaners={[
          { id: "cleaner-a", name: "Cleaner A" },
          { id: "cleaner-b", name: "Cleaner B" },
        ]}
        services={[{ id: "service-1", name: "Standard clean" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Move Cleaner B up" }));

    await waitFor(() => {
      expect(mocks.savePreferredCleanerOrder).toHaveBeenCalledWith({
        clientId: client.id,
        siteId,
        cleanerIds: ["cleaner-b", "cleaner-a"],
      });
    });
    const preferredList = screen.getByRole("list", {
      name: "Preferred cleaners for Broadbeach Towers",
    });
    expect(within(preferredList).getAllByRole("listitem")[0]).toHaveTextContent(
      "Cleaner B",
    );
    expect(screen.getByRole("button", { name: "Move Cleaner B up" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Refreshing the saved preferred cleaner order…",
    );
    expect(mocks.reloadCurrentPage).toHaveBeenCalledOnce();
  });
});
