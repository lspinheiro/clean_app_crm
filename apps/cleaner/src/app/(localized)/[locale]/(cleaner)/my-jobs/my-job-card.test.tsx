import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MyJob } from "@/features/my-jobs/types";

import { MyJobCard } from "./my-job-card";

function job(overrides: Partial<MyJob> = {}): MyJob {
  return {
    assignmentId: "assignment-1",
    jobId: "job-1",
    slotNumber: 1,
    companyName: "Coastal Demo Cleaning",
    siteName: "Palm Grove Practice",
    suburb: "Robina",
    serviceName: "Standard clean",
    serviceSlug: "standard-clean",
    status: "assigned",
    scheduledStart: "2026-08-19T20:00:00+00:00",
    durationMinutes: 90,
    cleanerPayCents: 9000,
    ...overrides,
  };
}

function renderCard(props: Partial<Parameters<typeof MyJobCard>[0]> = {}) {
  const onAdvance = vi.fn();
  const onShowAddress = vi.fn();
  const onConfirmToggle = vi.fn();

  render(
    <ul>
      <MyJobCard
        access={null}
        busy={false}
        confirming={false}
        error={null}
        job={job()}
        onAdvance={onAdvance}
        onConfirmToggle={onConfirmToggle}
        onShowAddress={onShowAddress}
        {...props}
      />
    </ul>,
  );

  return { onAdvance, onShowAddress, onConfirmToggle };
}

describe("CLE-24 the address is gated behind a deliberate tap", () => {
  it("shows no address or access notes before she asks", () => {
    renderCard();

    expect(screen.getByText("Palm Grove Practice · Robina")).toBeInTheDocument();
    expect(screen.queryByText(/Bayview/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Maps" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show address" })).toBeEnabled();
  });

  it("asks the page to fetch rather than fetching itself", async () => {
    const { onShowAddress } = renderCard();

    await userEvent.click(screen.getByRole("button", { name: "Show address" }));

    expect(onShowAddress).toHaveBeenCalledWith("job-1");
  });

  it("shows the address, the notes and a maps link once revealed", () => {
    renderCard({
      access: {
        address: "12 Bayview Rd, Robina QLD 4226",
        accessNotes: "Side gate, code 4417",
      },
    });

    expect(screen.getByText("12 Bayview Rd, Robina QLD 4226")).toBeInTheDocument();
    expect(screen.getByText("Side gate, code 4417")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Maps" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=12%20Bayview%20Rd%2C%20Robina%20QLD%204226",
    );
    expect(screen.queryByRole("button", { name: "Show address" })).not.toBeInTheDocument();
  });

  it("does not invent a notes line when the site has none", () => {
    // get_cleaner_job_access coalesces missing notes to an empty string.
    renderCard({ access: { address: "12 Bayview Rd, Robina QLD 4226", accessNotes: "" } });

    expect(screen.getByText("12 Bayview Rd, Robina QLD 4226")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Maps" })).toBeInTheDocument();
  });
});

describe("CLE-24 the status control", () => {
  it("explains a shut control on a job whose crew is incomplete", () => {
    renderCard({ job: job({ status: "posted" }) });

    expect(screen.getByText("Starts once the crew is complete")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /On my way|Start work|Job done/ }),
    ).not.toBeInTheDocument();
  });

  it("advances a single tap on a reversible step", async () => {
    const { onAdvance } = renderCard({ job: job({ status: "on_the_way" }) });

    await userEvent.click(screen.getByRole("button", { name: "Start work" }));

    expect(onAdvance).toHaveBeenCalledWith("job-1", "in_progress");
  });

  it("does not finish the job on the first tap", async () => {
    const { onAdvance, onConfirmToggle } = renderCard({ job: job({ status: "in_progress" }) });

    await userEvent.click(screen.getByRole("button", { name: "Job done" }));

    expect(onAdvance).not.toHaveBeenCalled();
    expect(onConfirmToggle).toHaveBeenCalledWith("job-1");
  });

  it("finishes the job on the second tap and says the step is final", async () => {
    const { onAdvance } = renderCard({
      job: job({ status: "in_progress" }),
      confirming: true,
    });

    expect(screen.getByText("This ends the job and cannot be undone.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tap again to confirm" }));

    expect(onAdvance).toHaveBeenCalledWith("job-1", "completed");
  });

  it("cannot be tapped twice while a change is in flight", async () => {
    const { onAdvance } = renderCard({ busy: true });

    const control = screen.getByRole("button", { name: "Saving…" });
    expect(control).toBeDisabled();

    await userEvent.click(control);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it("says what went wrong in her own words", () => {
    renderCard({ error: "This job has already moved on." });

    expect(screen.getByRole("alert")).toHaveTextContent("This job has already moved on.");
  });
});
