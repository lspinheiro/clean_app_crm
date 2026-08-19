import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MyJobRow } from "@/features/my-jobs/types";
import { createSupabaseHarness } from "@/test/supabase";

const mocks = vi.hoisted(() => ({
  harness: null as ReturnType<typeof createSupabaseHarness<never>> | null,
  useCleaner: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: mocks.harness!.from,
    rpc: mocks.harness!.rpc,
    auth: { signOut: mocks.harness!.signOut },
  }),
}));

vi.mock("@/lib/auth/use-cleaner", () => ({ useCleaner: mocks.useCleaner }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import MyJobsPage from "./page";

function row(overrides: Partial<MyJobRow> = {}): MyJobRow {
  return {
    assignment_id: "assignment-1",
    job_id: "job-a",
    slot_number: 1,
    company_name: "Coastal Demo Cleaning",
    site_name: "Palm Grove Practice",
    suburb: "Robina",
    service_name: "Standard clean",
    status: "assigned",
    scheduled_start: "2026-08-19T20:00:00+00:00",
    duration_minutes: 90,
    cleaner_pay_cents: 9000,
    ...overrides,
  };
}

const jobB = {
  assignment_id: "assignment-2",
  job_id: "job-b",
  site_name: "Bond Tower",
  scheduled_start: "2026-08-20T20:00:00+00:00",
} satisfies Partial<MyJobRow>;

function card(siteName: string) {
  const item = screen.getByText(new RegExp(`^${siteName} · `)).closest("li");
  if (!item) throw new Error(`no card rendered for ${siteName}`);
  return within(item);
}

let harness: ReturnType<typeof createSupabaseHarness<MyJobRow>>;

beforeEach(() => {
  harness = createSupabaseHarness<MyJobRow>();
  mocks.harness = harness as unknown as ReturnType<typeof createSupabaseHarness<never>>;
  mocks.useCleaner.mockReturnValue({
    status: "allowed",
    profile: { id: "cleaner-1", role: "cleaner", full_name: "Ana Souza", suburb: "Robina" },
  });
});

describe("CLE-24 the address is fetched only when she asks", () => {
  it("does not call get_cleaner_job_access while merely listing her jobs", async () => {
    render(<MyJobsPage />);
    await harness.answerRead(0, [row(), row(jobB)]);

    // Every call writes a site_access_log row, so listing must not log a lookup.
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("reveals the address on the card that asked for it, and only that one", async () => {
    const user = userEvent.setup();
    render(<MyJobsPage />);
    await harness.answerRead(0, [row(), row(jobB)]);

    await user.click(card("Palm Grove Practice").getByRole("button", { name: "Show address" }));
    await harness.answerRpc(0, {
      data: [{ address: "12 Bayview Rd, Robina QLD 4226", access_notes: "Side gate" }],
      error: null,
    });

    expect(harness.calls[0].fn).toBe("get_cleaner_job_access");
    expect(harness.calls[0].args).toEqual({ target_job_id: "job-a" });
    expect(screen.getByText("12 Bayview Rd, Robina QLD 4226")).toBeInTheDocument();
    expect(card("Bond Tower").getByRole("button", { name: "Show address" })).toBeInTheDocument();
  });

  it("explains an address it may no longer show", async () => {
    const user = userEvent.setup();
    render(<MyJobsPage />);
    await harness.answerRead(0, [row()]);

    await user.click(screen.getByRole("button", { name: "Show address" }));
    await harness.answerRpc(0, { data: null, error: { message: "Job access is unavailable" } });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We cannot show the address for this job any more.",
    );
  });
});

describe("CLE-24 concurrent taps on different cards", () => {
  it("holds every in-flight card busy, not just the last one tapped", async () => {
    const user = userEvent.setup();
    render(<MyJobsPage />);
    await harness.answerRead(0, [row(), row(jobB)]);

    await user.click(card("Palm Grove Practice").getByRole("button", { name: "On my way" }));
    await user.click(card("Bond Tower").getByRole("button", { name: "On my way" }));

    expect(screen.getAllByRole("button", { name: "Saving…" })).toHaveLength(2);

    await harness.answerRpc(0, { error: null });
    await harness.answerRead(1, [row({ status: "on_the_way" }), row(jobB)]);

    expect(card("Bond Tower").getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("discards a list read that resolves after a newer one", async () => {
    const user = userEvent.setup();
    render(<MyJobsPage />);
    await harness.answerRead(0, [row(), row(jobB)]);

    await user.click(card("Palm Grove Practice").getByRole("button", { name: "On my way" }));
    await user.click(card("Bond Tower").getByRole("button", { name: "On my way" }));

    await harness.answerRpc(0, { error: null });
    await harness.answerRpc(1, { error: null });

    // The second read was issued last, so it carries the newer truth — answer it first,
    // then let the older read land late.
    await harness.answerRead(2, [
      row({ status: "on_the_way" }),
      row({ ...jobB, status: "on_the_way" }),
    ]);
    await harness.answerRead(1, [row({ status: "on_the_way" }), row(jobB)]);

    expect(screen.getAllByRole("button", { name: "Start work" })).toHaveLength(2);
  });
});

describe("CLE-24 finishing a job", () => {
  it("takes two taps and sends completed only on the second", async () => {
    const user = userEvent.setup();
    render(<MyJobsPage />);
    await harness.answerRead(0, [row({ status: "in_progress" })]);

    await user.click(screen.getByRole("button", { name: "Job done" }));
    expect(harness.rpc).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Tap again to confirm" }));
    expect(harness.calls[0].fn).toBe("update_job_status");
    expect(harness.calls[0].args).toEqual({
      target_job_id: "job-a",
      target_new_status: "completed",
    });
  });

  it("drops the job off the list once it is done", async () => {
    const user = userEvent.setup();
    render(<MyJobsPage />);
    await harness.answerRead(0, [row({ status: "in_progress" }), row(jobB)]);

    await user.click(card("Palm Grove Practice").getByRole("button", { name: "Job done" }));
    await user.click(
      card("Palm Grove Practice").getByRole("button", { name: "Tap again to confirm" }),
    );
    await harness.answerRpc(0, { error: null });
    // cleaner_my_jobs filters `completed`, so the re-read simply no longer returns it.
    await harness.answerRead(1, [row(jobB)]);

    expect(screen.queryByText(/^Palm Grove Practice · /)).not.toBeInTheDocument();
    expect(screen.getByText(/^Bond Tower · /)).toBeInTheDocument();
  });

  it("does not leave a second card armed when she moves to another", async () => {
    const user = userEvent.setup();
    render(<MyJobsPage />);
    await harness.answerRead(0, [
      row({ status: "in_progress" }),
      row({ ...jobB, status: "in_progress" }),
    ]);

    await user.click(card("Palm Grove Practice").getByRole("button", { name: "Job done" }));
    await user.click(card("Bond Tower").getByRole("button", { name: "Job done" }));

    expect(
      card("Palm Grove Practice").getByRole("button", { name: "Job done" }),
    ).toBeInTheDocument();
    expect(
      card("Bond Tower").getByRole("button", { name: "Tap again to confirm" }),
    ).toBeInTheDocument();
  });
});

describe("CLE-24 an empty list explains itself", () => {
  it("says she has no jobs rather than showing a blank screen", async () => {
    render(<MyJobsPage />);
    await harness.answerRead(0, []);

    expect(screen.getByText("No jobs yet.")).toBeInTheDocument();
  });
});
