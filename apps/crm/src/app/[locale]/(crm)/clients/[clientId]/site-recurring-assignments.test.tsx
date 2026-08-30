import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  reloadCurrentPage: vi.fn(),
  revokeJobOffer: vi.fn(),
  saveRecurringAssignment: vi.fn(),
  setRecurringAssignmentActive: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/recurring-assignments", () => ({
  saveRecurringAssignment: mocks.saveRecurringAssignment,
  setRecurringAssignmentActive: mocks.setRecurringAssignmentActive,
}));
vi.mock("@/app/actions/offers", () => ({
  revokeJobOffer: mocks.revokeJobOffer,
}));
vi.mock("@/lib/reload-page", () => ({
  reloadCurrentPage: mocks.reloadCurrentPage,
}));

import { SiteRecurringAssignments } from "./site-recurring-assignments";

import type { RecurringAssignmentSummary } from "@/features/recurring-assignments/types";

const clientId = "10000000-0000-4000-8000-000000000301";
const siteId = "10000000-0000-4000-8000-000000000401";
const serviceId = "30000000-0000-4000-8000-000000000002";
const cleanerId = "10000000-0000-4000-8000-000000000002";

const assignments: RecurringAssignmentSummary[] = [
  {
    id: "10000000-0000-4000-8000-000000000701",
    siteId,
    service: { id: serviceId, name: "Standard clean" },
    frequency: "weekly" as const,
    weekday: 1,
    anchorDate: "2026-08-10",
    startTime: "08:00:00",
    durationMinutes: 120,
    cleanerPayCents: 12000,
    crewSize: 2,
    active: true,
    namedCleaners: [{
      id: cleanerId,
      name: "Cleaner A",
      slotNumber: 1,
      consentState: {
        status: "offered",
        createdAt: "2026-08-26T21:30:00Z",
      },
    }],
  },
];

function renderSurface(assignmentRows = assignments) {
  return render(
    <SiteRecurringAssignments
      assignments={assignmentRows}
      clientId={clientId}
      defaultDurationMinutes={120}
      defaultServiceId={serviceId}
      cleaners={[
        { id: cleanerId, name: "Cleaner A" },
        { id: "10000000-0000-4000-8000-000000000003", name: "Cleaner B" },
      ]}
      services={[{ id: serviceId, name: "Standard clean" }]}
      siteId={siteId}
      siteName="Broadbeach Towers"
    />,
  );
}

describe("CLE-14 recurring assignment site surface", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.saveRecurringAssignment.mockResolvedValue({
      ok: true,
      fieldErrors: {},
      formError: null,
    });
    mocks.setRecurringAssignmentActive.mockResolvedValue({
      ok: true,
      fieldErrors: {},
      formError: null,
    });
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists crew coverage and persists the active toggle", async () => {
    const user = userEvent.setup();
    renderSurface();

    expect(screen.getByText("Every Mon")).toBeInTheDocument();
    expect(screen.getByText(/Cleaner A \+ 1 open/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Post Every Mon publicly" })).toHaveAttribute(
      "href",
      `/cleaners/postings/new?intent=regular&recurringAssignmentId=${assignments[0].id}`,
    );

    await user.click(screen.getByRole("switch", { name: "Deactivate Every Mon" }));

    await waitFor(() => {
      expect(mocks.setRecurringAssignmentActive).toHaveBeenCalledWith({
        clientId,
        recurringAssignmentId: assignments[0].id,
        active: false,
      });
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("submits a crew-two rule with one named cleaner in slot order", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: "Add schedule" }));
    const dialog = screen.getByRole("dialog", {
      name: "Add schedule for Broadbeach Towers",
    });
    await user.clear(within(dialog).getByLabelText("First service date"));
    await user.type(within(dialog).getByLabelText("First service date"), "2026-08-11");
    await user.type(within(dialog).getByLabelText("Cleaner pay per slot (AUD)"), "120");
    await user.clear(within(dialog).getByLabelText("Crew size"));
    await user.type(within(dialog).getByLabelText("Crew size"), "2");
    await user.selectOptions(within(dialog).getByLabelText("Slot 1"), cleanerId);
    await user.click(within(dialog).getByRole("button", { name: "Add schedule" }));

    await waitFor(() => {
      expect(mocks.saveRecurringAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId,
          siteId,
          recurringAssignmentId: "",
          crewSize: "2",
          cleanerIds: [cleanerId, ""],
        }),
      );
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows an offered named cleaner with the age of the series offer", () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-08-27T00:00:00Z").getTime(),
    );
    renderSurface();

    expect(screen.getByText("Cleaner A", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Offered")).toBeInTheDocument();
    expect(screen.getByText("2 hrs ago")).toBeInTheDocument();
  });

  it("keeps the offered chip and omits its age when the offer timestamp is unavailable", () => {
    const { container } = renderSurface([
      {
        ...assignments[0],
        namedCleaners: [{
          id: cleanerId,
          name: "Cleaner A",
          slotNumber: 1,
          consentState: { status: "offered" },
        }],
      },
    ]);

    expect(screen.getByText("Offered")).toBeInTheDocument();
    expect(container.querySelector("time")).not.toBeInTheDocument();
  });

  it("shows accepted when the named cleaner has granted standing consent", () => {
    renderSurface([
      {
        ...assignments[0],
        namedCleaners: [{
          id: cleanerId,
          name: "Cleaner A",
          slotNumber: 1,
          consentState: { status: "accepted" },
        }],
      },
    ]);

    expect(screen.getByText("Cleaner A", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByText("Offered")).not.toBeInTheDocument();
  });

  it("explains and persists withdrawing a pending offer when its cleaner is removed", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: "Edit Every Mon" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Every Mon" });
    expect(within(dialog).getByText(
      "Choosing a cleaner sends a series offer. Removing a cleaner with a pending offer withdraws it. Remaining slots become vacancies when jobs are generated.",
    )).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText("Slot 1"), "");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mocks.saveRecurringAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          recurringAssignmentId: assignments[0].id,
          cleanerIds: ["", ""],
        }),
      );
    });
    expect(mocks.revokeJobOffer).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("discards abandoned edits when the same rule is reopened", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: "Edit Every Mon" }));
    let dialog = screen.getByRole("dialog", { name: "Edit Every Mon" });
    await user.clear(within(dialog).getByLabelText("Start time"));
    await user.type(within(dialog).getByLabelText("Start time"), "09:30");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Edit Every Mon" }));
    dialog = screen.getByRole("dialog", { name: "Edit Every Mon" });
    expect(within(dialog).getByLabelText("Start time")).toHaveValue("08:00");
  });
});
