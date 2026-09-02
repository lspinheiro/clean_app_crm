import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPosting: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/actions/postings", () => ({
  createPosting: mocks.createPosting,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

import { PostingComposer } from "./posting-composer";

const jobId = "22000000-0000-4000-8000-000000000501";
const recurringAssignmentId = "10000000-0000-4000-8000-000000000701";
const jobs = [{
  cleanerPayCents: 15000,
  durationMinutes: 120,
  id: jobId,
  intent: "one_time" as const,
  scheduledStart: "2026-09-07T22:00:00Z",
  serviceName: "Standard clean",
  siteName: "Broadbeach Towers",
  suburb: "Broadbeach",
  address: "10 Surf Parade",
  accessNotes: "Collect the loading dock key.",
  clientChargeCents: 48000,
  clientPhone: "0400 123 456",
  internalNotes: "Kitchen detail after the standard clean.",
}];
const recurringAssignments = [{
  cleanerPayCents: 13000,
  durationMinutes: 90,
  frequency: "weekly" as const,
  id: recurringAssignmentId,
  intent: "regular" as const,
  localStartTime: "08:00:00",
  serviceName: "Hotel clean",
  siteName: "Surfers Hotel",
  suburb: "Surfers Paradise",
  weekday: 2 as const,
  address: "2 Secret Street",
  accessNotes: "Alarm code 1234",
}];

describe("CLE-60 shared posting composer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPosting.mockResolvedValue({
      ok: true,
      postingId: "59000000-0000-4000-8000-000000000501",
    });
  });

  it("pre-fills a record-first job and previews only its public record details", () => {
    render(
      <PostingComposer
        initialIntent="one_time"
        initialTargetId={jobId}
        jobs={jobs}
        recurringAssignments={recurringAssignments}
      />,
    );

    expect(screen.getByRole("radio", { name: "One-time opportunity" })).toBeChecked();
    expect(screen.getByLabelText("Job")).toHaveValue(jobId);
    const preview = screen.getByRole("region", { name: "Public page preview" });
    expect(preview).toHaveTextContent("Tue, 8 Sept");
    expect(preview).toHaveTextContent("8:00 am");
    expect(preview).toHaveTextContent("Standard clean");
    expect(preview).toHaveTextContent("Broadbeach");
    expect(preview).toHaveTextContent("$150");
    expect(preview).toHaveTextContent("2 h");
    expect(preview).not.toHaveTextContent("10 Surf Parade");
    expect(preview).not.toHaveTextContent("Collect the loading dock key");
    expect(preview).not.toHaveTextContent("$480");
    expect(preview).not.toHaveTextContent("0400 123 456");
    expect(preview).not.toHaveTextContent("Kitchen detail");
  });

  it("switches intent-first to a regular record and submits the same composer", async () => {
    const user = userEvent.setup();
    render(
      <PostingComposer
        initialIntent={null}
        initialTargetId={null}
        jobs={jobs}
        recurringAssignments={recurringAssignments}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Regular opportunity" }));
    await user.selectOptions(screen.getByLabelText("Recurring assignment"), recurringAssignmentId);
    const preview = screen.getByRole("region", { name: "Public page preview" });
    expect(preview).toHaveTextContent("Every Tue at 08:00");
    expect(preview).toHaveTextContent("Hotel clean");
    expect(preview).toHaveTextContent("Surfers Paradise");
    expect(preview).toHaveTextContent("$130");
    expect(preview).toHaveTextContent("1 h 30 min");
    expect(preview).not.toHaveTextContent("2 Secret Street");
    expect(preview).not.toHaveTextContent("Alarm code 1234");
    await user.type(
      screen.getByLabelText("Public description"),
      "Join a regular hotel roster.",
    );
    await user.type(screen.getByLabelText("Application cap (optional)"), "20");
    await user.click(screen.getByRole("button", { name: "Create posting" }));

    await waitFor(() => expect(mocks.createPosting).toHaveBeenCalledWith({
      applicationCap: "20",
      expiresAt: "",
      intent: "regular",
      publicDescription: "Join a regular hotel roster.",
      targetId: recurringAssignmentId,
    }));
    expect(mocks.push).toHaveBeenCalledWith("/cleaners");
  });
});
