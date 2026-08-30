import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return {
    approveJobApplication: vi.fn(),
    assignJobSlot: vi.fn(),
    cancelJob: vi.fn(),
    channel,
    createClient: vi.fn(),
    markJobApplicationNotSelected: vi.fn(),
    offerJob: vi.fn(),
    refresh: vi.fn(),
    removeChannel: vi.fn(),
    revokeJobOffer: vi.fn(),
    restoreJobApplication: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/jobs", () => ({
  approveJobApplication: mocks.approveJobApplication,
  assignJobSlot: mocks.assignJobSlot,
  cancelJob: mocks.cancelJob,
  markJobApplicationNotSelected: mocks.markJobApplicationNotSelected,
  restoreJobApplication: mocks.restoreJobApplication,
}));
vi.mock("@/app/actions/offers", () => ({
  offerJob: mocks.offerJob,
  revokeJobOffer: mocks.revokeJobOffer,
}));
vi.mock("@/lib/supabase/browser", () => ({
  createClient: mocks.createClient,
}));

import { JobDetailWorkspace } from "./job-detail-workspace";

import type { JobDetail } from "@/features/jobs/types";

const job: JobDetail = {
  id: "22000000-0000-4000-8000-000000000501",
  status: "posted",
  scheduledStart: "2026-08-17T22:00:00Z",
  durationMinutes: 150,
  cleanerPayCents: 15000,
  clientChargeCents: 48000,
  notes: "Kitchen detail after the standard clean.",
  crewSize: 2,
  clientName: "Oceanview Property Group",
  serviceName: "Standard clean",
  site: {
    id: "10000000-0000-4000-8000-000000000401",
    name: "Broadbeach Towers",
    address: "10 Surf Parade",
    suburb: "Broadbeach",
    accessNotes: "Collect the loading dock key.",
  },
  slots: [
    {
      slotNumber: 1,
      state: "assigned",
      assignment: {
        cleanerId: "10000000-0000-4000-8000-000000000002",
        cleanerName: "Demo Cleaner One",
        source: "recurring",
        assignedAt: "2026-08-11T08:00:00Z",
      },
    },
    {
      slotNumber: 2,
      state: "open",
      previousAssignment: null,
    },
  ],
  applicants: [
    {
      cleanerId: "10000000-0000-4000-8000-000000000006",
      cleanerName: "Preferred First",
      status: "applied",
      appliedAt: "2026-08-11T10:00:00Z",
      preferredRank: 1,
    },
    {
      cleanerId: "10000000-0000-4000-8000-000000000003",
      cleanerName: "Preferred Second",
      status: "applied",
      appliedAt: "2026-08-11T08:00:00Z",
      preferredRank: 2,
    },
    {
      cleanerId: "10000000-0000-4000-8000-000000000004",
      cleanerName: "Unranked Applicant",
      status: "applied",
      appliedAt: "2026-08-11T07:00:00Z",
      preferredRank: null,
    },
  ],
  cleanerCandidates: [
    {
      cleanerId: "10000000-0000-4000-8000-000000000006",
      cleanerName: "Preferred First",
      preferredRank: 1,
    },
    {
      cleanerId: "10000000-0000-4000-8000-000000000003",
      cleanerName: "Preferred Second",
      preferredRank: 2,
    },
    {
      cleanerId: "10000000-0000-4000-8000-000000000004",
      cleanerName: "Unranked Applicant",
      preferredRank: null,
    },
    {
      cleanerId: "10000000-0000-4000-8000-000000000007",
      cleanerName: "Direct Cleaner",
      preferredRank: null,
    },
  ],
  pendingOffers: [],
};

function closeSlots(slots: JobDetail["slots"]): JobDetail["slots"] {
  return slots.map((slot) => {
    if (slot.state === "assigned") {
      return {
        slotNumber: slot.slotNumber,
        state: "closed",
        previousAssignment: {
          ...slot.assignment,
          releasedAt: "2026-08-11T09:00:00Z",
        },
      };
    }
    return {
      slotNumber: slot.slotNumber,
      state: "closed",
      previousAssignment: slot.previousAssignment,
    };
  });
}

describe("CLE-22 job detail workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.approveJobApplication.mockResolvedValue({ ok: true, formError: null });
    mocks.assignJobSlot.mockResolvedValue({ ok: true, formError: null });
    mocks.cancelJob.mockResolvedValue({ ok: true, formError: null });
    mocks.markJobApplicationNotSelected.mockResolvedValue({ ok: true, formError: null });
    mocks.offerJob.mockResolvedValue({ ok: true, formError: null });
    mocks.revokeJobOffer.mockResolvedValue({ ok: true, formError: null });
    mocks.restoreJobApplication.mockResolvedValue({ ok: true, formError: null });
    mocks.channel.on.mockReturnValue(mocks.channel);
    mocks.channel.subscribe.mockReturnValue(mocks.channel);
    mocks.createClient.mockReturnValue({
      channel: vi.fn(() => mocks.channel),
      removeChannel: mocks.removeChannel,
    });
    HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
  });

  afterEach(cleanup);

  it("renders full admin detail, numbered slots, and preferred applicants first", () => {
    render(<JobDetailWorkspace job={job} />);

    expect(screen.getByRole("heading", { name: "Broadbeach Towers" })).toBeInTheDocument();
    expect(screen.getByText("Oceanview Property Group")).toBeInTheDocument();
    expect(screen.getByText("Standard clean")).toBeInTheDocument();
    expect(screen.getByText("Posted")).toBeInTheDocument();
    expect(screen.getAllByText("Tue, 18 Aug").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8:00 am").length).toBeGreaterThan(0);
    expect(screen.getByText("2 h 30 min")).toBeInTheDocument();
    expect(screen.getByText("10 Surf Parade · Broadbeach")).toBeInTheDocument();
    expect(screen.getByText("Collect the loading dock key.")).toBeInTheDocument();
    expect(screen.getByText("$150")).toBeInTheDocument();
    expect(screen.getByText("$480")).toBeInTheDocument();
    expect(screen.getByText("Kitchen detail after the standard clean.")).toBeInTheDocument();
    expect(screen.getByText("Date", { selector: "dt" })).toBeInTheDocument();
    expect(screen.getByText("Duration", { selector: "dt" })).toBeInTheDocument();
    expect(screen.queryByText("Job date", { selector: "dt" })).not.toBeInTheDocument();
    expect(screen.queryByText("Duration (hours)", { selector: "dt" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Post publicly" })).toHaveAttribute(
      "href",
      `/cleaners/postings/new?intent=one_time&jobId=${job.id}`,
    );

    const slotOne = screen.getByRole("article", { name: "Crew slot 1" });
    expect(within(slotOne).getByText("Assigned")).toBeInTheDocument();
    expect(within(slotOne).getByText("Demo Cleaner One")).toBeInTheDocument();
    expect(within(slotOne).queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Crew slot 2" })).toHaveTextContent("Open");

    const applicantItems = within(
      screen.getByRole("list", { name: "Job applicants" }),
    ).getAllByRole("listitem");
    expect(applicantItems.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Preferred First"),
      expect.stringContaining("Preferred Second"),
      expect.stringContaining("Unranked Applicant"),
    ]);

    const options = within(screen.getByLabelText("Cleaner to offer this job"))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "Choose a cleaner",
      "Direct Cleaner",
    ]);
  });

  it("leads with an awaiting-review queue while keeping crew progress in context", () => {
    render(<JobDetailWorkspace job={job} />);

    expect(screen.getByText("1 open slot · 3 awaiting review")).toBeInTheDocument();
    const applicationsHeading = screen.getByRole("heading", { name: "Applications" });
    const crewHeading = screen.getByRole("heading", { name: "Crew slots" });
    expect(
      applicationsHeading.compareDocumentPosition(crewHeading)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const queue = screen.getByRole("region", { name: "Awaiting review" });
    expect(within(queue).getAllByRole("article").map((item) => item.textContent))
      .toEqual([
        expect.stringContaining("Preferred First"),
        expect.stringContaining("Preferred Second"),
        expect.stringContaining("Unranked Applicant"),
      ]);
    expect(screen.getByText(/Approval assigns Preferred First immediately/))
      .toBeInTheDocument();
    const disclosures = within(queue).getAllByRole("group");
    expect(disclosures).toHaveLength(3);
    expect(disclosures.every((details) => details.getAttribute("name") === "application-review"))
      .toBe(true);
  });

  it("shows progress on the review action that is actually running", async () => {
    let finishReview: ((value: { ok: true; formError: null }) => void) | undefined;
    mocks.markJobApplicationNotSelected.mockReturnValue(new Promise((resolve) => {
      finishReview = resolve;
    }));
    const user = userEvent.setup();
    render(<JobDetailWorkspace job={job} />);

    await user.click(
      screen.getByRole("button", { name: "Mark Preferred First not selected" }),
    );

    expect(screen.getByRole("button", {
      name: "Marking Preferred First not selected…",
    })).toBeDisabled();
    expect(screen.getByRole("button", {
      name: "Approve Preferred First for slot 2",
    })).toBeDisabled();

    finishReview?.({ ok: true, formError: null });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });

  it("approves an awaiting applicant for the selected open slot", async () => {
    const user = userEvent.setup();
    render(<JobDetailWorkspace job={job} />);

    await user.selectOptions(
      screen.getByLabelText("Crew slot for Preferred First"),
      "2",
    );
    await user.click(
      screen.getByRole("button", { name: "Approve Preferred First for slot 2" }),
    );

    await waitFor(() => expect(mocks.approveJobApplication).toHaveBeenCalledOnce());
    const formData = mocks.approveJobApplication.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData.entries())).toEqual({
      jobId: job.id,
      slotNumber: "2",
      cleanerId: "10000000-0000-4000-8000-000000000006",
    });
    expect(mocks.assignJobSlot).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("falls back to a current open slot when a stored review selection becomes stale", async () => {
    const user = userEvent.setup();
    const twoOpenSlots: JobDetail = {
      ...job,
      slots: [
        { slotNumber: 1, state: "open", previousAssignment: null },
        { slotNumber: 2, state: "open", previousAssignment: null },
      ],
    };
    const { rerender } = render(<JobDetailWorkspace job={twoOpenSlots} />);

    await user.selectOptions(
      screen.getByLabelText("Crew slot for Preferred First"),
      "2",
    );
    rerender(
      <JobDetailWorkspace
        job={{
          ...twoOpenSlots,
          slots: [
            { slotNumber: 1, state: "open", previousAssignment: null },
            {
              slotNumber: 2,
              state: "assigned",
              assignment: {
                cleanerId: "10000000-0000-4000-8000-000000000007",
                cleanerName: "Direct Cleaner",
                source: "manual",
                assignedAt: "2026-08-11T11:00:00Z",
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByLabelText("Crew slot for Preferred First")).toHaveValue("1");
    expect(screen.getByRole("button", {
      name: "Approve Preferred First for slot 1",
    })).toBeEnabled();
  });

  it("resolves without a reason and restores only an eligible not-selected response", async () => {
    const user = userEvent.setup();
    const resolvedJob: JobDetail = {
      ...job,
      applicants: [
        { ...job.applicants[0], status: "applied" },
        { ...job.applicants[1], status: "not_selected" },
        { ...job.applicants[2], status: "withdrawn" },
      ],
    };
    render(<JobDetailWorkspace job={resolvedJob} />);

    await user.click(
      screen.getByRole("button", { name: "Mark Preferred First not selected" }),
    );
    const notSelectedData = mocks.markJobApplicationNotSelected.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(notSelectedData.entries())).toEqual({
      jobId: job.id,
      cleanerId: "10000000-0000-4000-8000-000000000006",
    });
    expect(screen.queryByRole("textbox", { name: /reason/i })).not.toBeInTheDocument();

    const resolved = screen.getByRole("region", { name: "Resolved responses" });
    await user.click(
      within(resolved).getByRole("button", { name: "Restore Preferred Second" }),
    );
    const restoreData = mocks.restoreJobApplication.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(restoreData.entries())).toEqual({
      jobId: job.id,
      cleanerId: "10000000-0000-4000-8000-000000000003",
    });
    expect(within(resolved).queryByRole("button", { name: "Restore Unranked Applicant" }))
      .not.toBeInTheDocument();
  });

  it("refreshes authoritative application state after a losing review", async () => {
    mocks.markJobApplicationNotSelected.mockResolvedValue({
      ok: false,
      formError: "user.applicationChanged",
    });
    const user = userEvent.setup();
    render(<JobDetailWorkspace job={job} />);

    await user.click(
      screen.getByRole("button", { name: "Mark Preferred First not selected" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This application changed",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps a restore failure beside the resolved applicant", async () => {
    mocks.restoreJobApplication.mockResolvedValue({
      ok: false,
      formError: "user.applicationChanged",
    });
    const user = userEvent.setup();
    const resolvedJob: JobDetail = {
      ...job,
      applicants: [
        { ...job.applicants[0], status: "applied" },
        { ...job.applicants[1], status: "not_selected" },
      ],
    };
    render(<JobDetailWorkspace job={resolvedJob} />);

    const resolved = screen.getByRole("region", { name: "Resolved responses" });
    await user.click(
      within(resolved).getByRole("button", { name: "Restore Preferred Second" }),
    );

    expect(await within(resolved).findByRole("alert")).toHaveTextContent(
      "This application changed",
    );
  });

  it("keeps non-applicant offers visually separate from application approval", () => {
    render(<JobDetailWorkspace job={job} />);

    const directedOffers = screen.getByRole("region", { name: "Directed offers" });
    expect(within(directedOffers).getByRole("option", { name: "Direct Cleaner" }))
      .toBeInTheDocument();
    expect(within(directedOffers).queryByRole("option", {
      name: "Preferred First — preferred #1",
    }))
      .not.toBeInTheDocument();
  });

  it("shows a pending directed offer with its age and a revoke control", () => {
    const pendingCreatedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const offeredJob = {
      ...job,
      pendingOffers: [
        {
          id: "51000000-0000-4000-8000-000000000801",
          cleanerId: "10000000-0000-4000-8000-000000000007",
          cleanerName: "Direct Cleaner",
          createdAt: pendingCreatedAt,
        },
      ],
    };

    render(<JobDetailWorkspace job={offeredJob} />);

    const pendingOffers = screen.getByRole("region", { name: "Pending offers" });
    expect(pendingOffers).toHaveTextContent("Direct Cleaner");
    expect(pendingOffers).toHaveTextContent("5 min ago");
    expect(within(pendingOffers).getByRole("button", {
      name: "Revoke offer to Direct Cleaner",
    })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Direct Cleaner" }))
      .not.toBeInTheDocument();
  });

  it("sends a directed offer to the selected eligible cleaner and refreshes", async () => {
    const user = userEvent.setup();
    render(<JobDetailWorkspace job={job} />);

    const directedOffers = screen.getByRole("region", { name: "Directed offers" });
    await user.selectOptions(
      within(directedOffers).getByLabelText("Cleaner to offer this job"),
      "10000000-0000-4000-8000-000000000007",
    );
    await user.click(within(directedOffers).getByRole("button", {
      name: "Send offer to Direct Cleaner",
    }));

    await waitFor(() => expect(mocks.offerJob).toHaveBeenCalledOnce());
    const formData = mocks.offerJob.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData.entries())).toEqual({
      jobId: job.id,
      cleanerId: "10000000-0000-4000-8000-000000000007",
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("revokes a pending directed offer and refreshes authoritative state", async () => {
    const user = userEvent.setup();
    const offeredJob = {
      ...job,
      pendingOffers: [{
        id: "51000000-0000-4000-8000-000000000801",
        cleanerId: "10000000-0000-4000-8000-000000000007",
        cleanerName: "Direct Cleaner",
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      }],
    };
    render(<JobDetailWorkspace job={offeredJob} />);

    await user.click(screen.getByRole("button", {
      name: "Revoke offer to Direct Cleaner",
    }));

    await waitFor(() => expect(mocks.revokeJobOffer).toHaveBeenCalledWith(
      job.id,
      "51000000-0000-4000-8000-000000000801",
    ));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not offer a legacy direct-assignment path to a non-applicant", () => {
    render(<JobDetailWorkspace job={job} />);

    expect(screen.queryByRole("region", { name: "Assign a cleaner directly" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Assign Direct Cleaner/ }))
      .not.toBeInTheDocument();
  });

  it("surfaces the revoke-first condition verbatim when approving an applicant", async () => {
    mocks.approveJobApplication.mockResolvedValue({
      ok: false,
      formError: "user.revokePendingOfferFirst",
    });
    const user = userEvent.setup();
    render(<JobDetailWorkspace job={job} />);

    await user.click(screen.getByRole("button", {
      name: "Approve Preferred First for slot 2",
    }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Revoke the pending offer first",
    );
  });

  it("shows offer progress without optimistically changing the open slot", async () => {
    let finishOffer: ((value: { ok: true; formError: null }) => void) | undefined;
    mocks.offerJob.mockReturnValue(new Promise((resolve) => {
      finishOffer = resolve;
    }));
    const user = userEvent.setup();
    render(<JobDetailWorkspace job={job} />);

    await user.selectOptions(
      screen.getByLabelText("Cleaner to offer this job"),
      "10000000-0000-4000-8000-000000000007",
    );
    await user.click(screen.getByRole("button", { name: "Send offer to Direct Cleaner" }));

    expect(screen.getByRole("button", { name: "Send offer to Direct Cleaner" }))
      .toBeDisabled();
    expect(screen.getByText("Sending offer…")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Crew slot 2" })).toHaveTextContent("Open");

    finishOffer?.({ ok: true, formError: null });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });

  it("keeps a released slot available for a directed offer when the job has reopened", async () => {
    const user = userEvent.setup();
    render(
      <JobDetailWorkspace
        job={{
          ...job,
          slots: [
            job.slots[0],
            {
              slotNumber: 2,
              state: "open",
              previousAssignment: {
                cleanerId: "10000000-0000-4000-8000-000000000008",
                cleanerName: "Removed Cleaner",
                source: "manual",
                assignedAt: "2026-08-10T08:00:00Z",
                releasedAt: "2026-08-10T09:00:00Z",
              },
            },
          ],
        }}
      />,
    );

    const reopenedSlot = screen.getByRole("article", { name: "Crew slot 2" });
    expect(within(reopenedSlot).getByText("Open")).toBeInTheDocument();
    expect(within(reopenedSlot).getByText("Previously assigned to Removed Cleaner"))
      .toBeInTheDocument();

    const directedOffers = screen.getByRole("region", {
      name: "Directed offers",
    });
    await user.selectOptions(
      within(directedOffers).getByLabelText("Cleaner to offer this job"),
      "10000000-0000-4000-8000-000000000007",
    );
    await user.click(
      within(directedOffers).getByRole("button", {
        name: "Send offer to Direct Cleaner",
      }),
    );

    const formData = mocks.offerJob.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData.entries())).toEqual({
      jobId: job.id,
      cleanerId: "10000000-0000-4000-8000-000000000007",
    });
  });

  it("does not carry an offer selection into a reopened slot lifecycle", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<JobDetailWorkspace job={job} />);

    await user.selectOptions(
      screen.getByLabelText("Cleaner to offer this job"),
      "10000000-0000-4000-8000-000000000007",
    );
    expect(
      screen.getByRole("button", {
        name: "Send offer to Direct Cleaner",
      }),
    ).toBeEnabled();

    rerender(
      <JobDetailWorkspace
        job={{
          ...job,
          status: "assigned",
          slots: [
            job.slots[0],
            {
              slotNumber: 2,
              state: "assigned",
              assignment: {
                cleanerId: "10000000-0000-4000-8000-000000000007",
                cleanerName: "Direct Cleaner",
                source: "manual",
                assignedAt: "2026-08-11T10:00:00Z",
              },
            },
          ],
        }}
      />,
    );
    rerender(
      <JobDetailWorkspace
        job={{
          ...job,
          status: "posted",
          slots: [
            job.slots[0],
            {
              slotNumber: 2,
              state: "open",
              previousAssignment: {
                cleanerId: "10000000-0000-4000-8000-000000000007",
                cleanerName: "Direct Cleaner",
                source: "manual",
                assignedAt: "2026-08-11T10:00:00Z",
                releasedAt: "2026-08-11T11:00:00Z",
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByLabelText("Cleaner to offer this job")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Send offer" }),
    ).toBeDisabled();
  });

  it("keeps a safe inline error and refreshes after a losing offer", async () => {
    mocks.offerJob.mockResolvedValue({
      ok: false,
      formError: "user.jobOfferChanged",
    });
    const user = userEvent.setup();
    const { rerender } = render(<JobDetailWorkspace job={job} />);

    await user.selectOptions(
      screen.getByLabelText("Cleaner to offer this job"),
      "10000000-0000-4000-8000-000000000007",
    );
    await user.click(screen.getByRole("button", { name: "Send offer to Direct Cleaner" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This offer could not be completed",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();

    rerender(
      <JobDetailWorkspace
        job={{
          ...job,
          status: "assigned",
          slots: job.slots.map((slot) =>
            slot.slotNumber === 2
              ? {
                  slotNumber: slot.slotNumber,
                  state: "assigned",
                  assignment: {
                    cleanerId: "10000000-0000-4000-8000-000000000007",
                    cleanerName: "Direct Cleaner",
                    source: "manual",
                    assignedAt: "2026-08-11T10:00:00Z",
                  },
                }
              : slot,
          ),
        }}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps offers available without applicants and explains an empty eligible list", () => {
    const { rerender } = render(
      <JobDetailWorkspace job={{ ...job, applicants: [] }} />,
    );
    expect(screen.getByText("No applications are awaiting review.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Direct Cleaner" })).toBeInTheDocument();

    rerender(
      <JobDetailWorkspace
        job={{ ...job, applicants: [], cleanerCandidates: [] }}
      />,
    );
    expect(screen.getByText("No eligible cleaners are available for an offer."))
      .toBeInTheDocument();
    expect(screen.queryByLabelText("Cleaner to offer this job")).not.toBeInTheDocument();
  });

  it("gates directed offers and cancellation across the job status matrix", () => {
    const { rerender } = render(<JobDetailWorkspace job={{ ...job, status: "draft" }} />);

    for (const status of ["draft", "posted"] as const) {
      rerender(<JobDetailWorkspace job={{ ...job, status }} />);
      expect(screen.getByLabelText("Cleaner to offer this job")).toBeInTheDocument();
    }
    for (const status of [
      "assigned",
      "on_the_way",
      "in_progress",
      "completed",
      "cancelled",
    ] as const) {
      rerender(<JobDetailWorkspace job={{ ...job, status }} />);
      expect(screen.queryByLabelText("Cleaner to offer this job")).not.toBeInTheDocument();
    }

    for (const status of [
      "draft",
      "posted",
      "assigned",
      "on_the_way",
      "in_progress",
    ] as const) {
      rerender(<JobDetailWorkspace job={{ ...job, status }} />);
      expect(screen.getByRole("button", { name: "Job actions" })).toBeInTheDocument();
    }
    for (const status of ["completed", "cancelled"] as const) {
      rerender(<JobDetailWorkspace job={{ ...job, status }} />);
      expect(screen.queryByRole("button", { name: "Job actions" })).not.toBeInTheDocument();
    }
  });

  it("dismisses the job-actions overflow from outside click and Escape", async () => {
    const user = userEvent.setup();
    render(<JobDetailWorkspace job={job} />);
    const trigger = screen.getByRole("button", { name: "Job actions" });
    const menu = trigger.closest("details");

    await user.click(trigger);
    expect(menu).toHaveAttribute("open");
    fireEvent.pointerDown(document.body);
    expect(menu).not.toHaveAttribute("open");

    await user.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("confirms cancellation and removes controls from cancelled state", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<JobDetailWorkspace job={job} />);

    await user.click(screen.getByRole("button", { name: "Job actions" }));
    await user.click(screen.getByRole("button", { name: "Cancel job" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel this job?" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));

    await waitFor(() => expect(mocks.cancelJob).toHaveBeenCalledWith(job.id));
    expect(mocks.refresh).toHaveBeenCalledOnce();

    rerender(
      <JobDetailWorkspace
        job={{
          ...job,
          status: "cancelled",
          slots: closeSlots(job.slots),
          applicants: job.applicants.map((applicant, index) => ({
            ...applicant,
            status: index === 0 ? "assigned" : "not_selected",
          })),
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Cancel job" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cleaner to offer this job")).not.toBeInTheDocument();
    const releasedSlot = screen.getByRole("article", { name: "Crew slot 1" });
    expect(within(releasedSlot).getByText("Closed")).toBeInTheDocument();
    expect(releasedSlot).toHaveTextContent(
      "Previously assigned to Demo Cleaner One",
    );
    expect(screen.queryByText("Released")).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Crew slot 2" })).toHaveTextContent(
      "Closed",
    );
    expect(screen.getAllByText("Not selected")).toHaveLength(2);
  });

  it("shows the safe cancellation error after refreshing an unchanged job", async () => {
    mocks.cancelJob.mockResolvedValue({
      ok: false,
      formError: "user.jobCancelChanged",
    });
    const user = userEvent.setup();
    const { rerender } = render(<JobDetailWorkspace job={job} />);

    await user.click(screen.getByRole("button", { name: "Job actions" }));
    await user.click(screen.getByRole("button", { name: "Cancel job" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel this job?" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The job could not be cancelled",
    );
    expect(dialog).not.toHaveAttribute("open");
    expect(mocks.refresh).toHaveBeenCalledOnce();

    rerender(
      <JobDetailWorkspace
        job={{
          ...job,
          status: "cancelled",
          slots: closeSlots(job.slots),
        }}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
