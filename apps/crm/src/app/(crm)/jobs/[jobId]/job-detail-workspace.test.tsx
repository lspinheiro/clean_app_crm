import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assignJobSlot: vi.fn(),
  cancelJob: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/jobs", () => ({
  assignJobSlot: mocks.assignJobSlot,
  cancelJob: mocks.cancelJob,
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
      cleanerId: "10000000-0000-4000-8000-000000000002",
      cleanerName: "Demo Cleaner One",
      source: "recurring",
    },
    {
      slotNumber: 2,
      state: "open",
      cleanerId: null,
      cleanerName: null,
      source: null,
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
  poolCandidates: [
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
      cleanerName: "Direct Pool Cleaner",
      preferredRank: null,
    },
  ],
};

describe("CLE-22 job detail workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assignJobSlot.mockResolvedValue({ ok: true, formError: null });
    mocks.cancelJob.mockResolvedValue({ ok: true, formError: null });
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
    expect(screen.getByText("Tue, 18 Aug")).toBeInTheDocument();
    expect(screen.getByText("8:00 am")).toBeInTheDocument();
    expect(screen.getByText("2 h 30 min")).toBeInTheDocument();
    expect(screen.getByText("10 Surf Parade · Broadbeach")).toBeInTheDocument();
    expect(screen.getByText("Collect the loading dock key.")).toBeInTheDocument();
    expect(screen.getByText("$150")).toBeInTheDocument();
    expect(screen.getByText("$480")).toBeInTheDocument();
    expect(screen.getByText("Kitchen detail after the standard clean.")).toBeInTheDocument();

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

    const options = within(screen.getByLabelText("Cleaner for slot 2"))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "Choose a cleaner",
      "Preferred First — preferred #1",
      "Preferred Second — preferred #2",
      "Unranked Applicant",
      "Direct Pool Cleaner",
    ]);
  });

  it("assigns the chosen applicant to the exact open slot without optimistic state", async () => {
    const user = userEvent.setup();
    render(<JobDetailWorkspace job={job} />);

    await user.selectOptions(
      screen.getByLabelText("Cleaner for slot 2"),
      "10000000-0000-4000-8000-000000000003",
    );
    await user.click(screen.getByRole("button", { name: "Assign Preferred Second to slot 2" }));

    await waitFor(() => expect(mocks.assignJobSlot).toHaveBeenCalledOnce());
    const formData = mocks.assignJobSlot.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData.entries())).toEqual({
      jobId: job.id,
      slotNumber: "2",
      cleanerId: "10000000-0000-4000-8000-000000000003",
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("article", { name: "Crew slot 2" })).toHaveTextContent("Open");
  });

  it("keeps a released slot assignable when the posted job has reopened", async () => {
    const user = userEvent.setup();
    render(
      <JobDetailWorkspace
        job={{
          ...job,
          slots: [
            job.slots[0],
            {
              slotNumber: 2,
              state: "released",
              cleanerId: "10000000-0000-4000-8000-000000000008",
              cleanerName: "Removed Pool Cleaner",
              source: "manual",
            },
          ],
        }}
      />,
    );

    const reopenedSlot = screen.getByRole("article", { name: "Crew slot 2" });
    expect(within(reopenedSlot).getByText("Open")).toBeInTheDocument();
    expect(within(reopenedSlot).getByText("Previously assigned to Removed Pool Cleaner"))
      .toBeInTheDocument();

    await user.selectOptions(
      within(reopenedSlot).getByLabelText("Cleaner for slot 2"),
      "10000000-0000-4000-8000-000000000007",
    );
    await user.click(
      within(reopenedSlot).getByRole("button", {
        name: "Assign Direct Pool Cleaner to slot 2",
      }),
    );

    const formData = mocks.assignJobSlot.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData.entries())).toEqual({
      jobId: job.id,
      slotNumber: "2",
      cleanerId: "10000000-0000-4000-8000-000000000007",
    });
  });

  it("keeps a safe inline error and refreshes after a losing assignment", async () => {
    mocks.assignJobSlot.mockResolvedValue({
      ok: false,
      formError: "This job changed while you were assigning it. Review the refreshed crew slots.",
    });
    const user = userEvent.setup();
    const { rerender } = render(<JobDetailWorkspace job={job} />);

    await user.selectOptions(
      screen.getByLabelText("Cleaner for slot 2"),
      "10000000-0000-4000-8000-000000000007",
    );
    await user.click(screen.getByRole("button", { name: "Assign Direct Pool Cleaner to slot 2" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This job changed");
    expect(mocks.refresh).toHaveBeenCalledOnce();

    rerender(
      <JobDetailWorkspace
        job={{
          ...job,
          status: "assigned",
          slots: job.slots.map((slot) =>
            slot.slotNumber === 2
              ? {
                  ...slot,
                  state: "assigned",
                  cleanerId: "10000000-0000-4000-8000-000000000007",
                  cleanerName: "Direct Pool Cleaner",
                  source: "manual",
                }
              : slot,
          ),
        }}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps direct assignment available without applicants and explains an empty pool", () => {
    const { rerender } = render(
      <JobDetailWorkspace job={{ ...job, applicants: [] }} />,
    );
    expect(screen.getByText("No applications yet.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Direct Pool Cleaner" })).toBeInTheDocument();

    rerender(
      <JobDetailWorkspace
        job={{ ...job, applicants: [], poolCandidates: [] }}
      />,
    );
    expect(screen.getByText("No active pool cleaners are available to assign.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cleaner for slot 2")).not.toBeInTheDocument();
  });

  it("gates slot assignment and cancellation across the job status matrix", () => {
    const { rerender } = render(<JobDetailWorkspace job={{ ...job, status: "draft" }} />);

    for (const status of ["draft", "posted"] as const) {
      rerender(<JobDetailWorkspace job={{ ...job, status }} />);
      expect(screen.getByLabelText("Cleaner for slot 2")).toBeInTheDocument();
    }
    for (const status of [
      "assigned",
      "on_the_way",
      "in_progress",
      "completed",
      "cancelled",
    ] as const) {
      rerender(<JobDetailWorkspace job={{ ...job, status }} />);
      expect(screen.queryByLabelText("Cleaner for slot 2")).not.toBeInTheDocument();
    }

    for (const status of [
      "draft",
      "posted",
      "assigned",
      "on_the_way",
      "in_progress",
    ] as const) {
      rerender(<JobDetailWorkspace job={{ ...job, status }} />);
      expect(screen.getByRole("button", { name: "Cancel job" })).toBeInTheDocument();
    }
    for (const status of ["completed", "cancelled"] as const) {
      rerender(<JobDetailWorkspace job={{ ...job, status }} />);
      expect(screen.queryByRole("button", { name: "Cancel job" })).not.toBeInTheDocument();
    }
  });

  it("confirms cancellation and removes controls from cancelled state", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<JobDetailWorkspace job={job} />);

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
          slots: job.slots.map((slot) =>
            slot.state === "assigned" ? { ...slot, state: "released" } : slot,
          ),
          applicants: job.applicants.map((applicant, index) => ({
            ...applicant,
            status: index === 0 ? "assigned" : "not_selected",
          })),
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Cancel job" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cleaner for slot 2")).not.toBeInTheDocument();
    expect(screen.getByText("Released")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Crew slot 2" })).toHaveTextContent(
      "Closed",
    );
    expect(screen.getAllByText("Not selected")).toHaveLength(2);
  });

  it("shows the safe cancellation error after refreshing an unchanged job", async () => {
    mocks.cancelJob.mockResolvedValue({
      ok: false,
      formError: "The job could not be cancelled. Review the refreshed job and try again.",
    });
    const user = userEvent.setup();
    const { rerender } = render(<JobDetailWorkspace job={job} />);

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
          slots: job.slots.map((slot) =>
            slot.state === "assigned" ? { ...slot, state: "released" } : slot,
          ),
        }}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
