import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardRow } from "@/features/board/types";
import { LanguageSwitcher } from "@/components/language-switcher";
import { renderWithCleanerIntl as render } from "@/test/render";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  useCleaner: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    auth: { signOut: mocks.signOut },
  }),
}));

vi.mock("@/lib/auth/use-cleaner", () => ({ useCleaner: mocks.useCleaner }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

import BoardPage from "./page";

type BoardResult = { data: BoardRow[] | null; error: { message: string } | null };
type RpcResult = { error: { message: string } | null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/**
 * Every board read and every RPC is held open until the test answers it by index. The
 * findings under test are all about *when* answers arrive relative to each other, so the
 * suite has to be able to answer them out of order.
 */
let reads: Array<ReturnType<typeof deferred<BoardResult>>>;
let calls: Array<{ fn: string; jobId: string; gate: ReturnType<typeof deferred<RpcResult>> }>;

async function answerRead(index: number, rows: BoardRow[] | null, error: BoardResult["error"] = null) {
  await waitFor(() => expect(reads.length).toBeGreaterThan(index));
  await act(async () => {
    reads[index].resolve({ data: rows, error });
  });
}

async function answerRpc(index: number, error: RpcResult["error"]) {
  await waitFor(() => expect(calls.length).toBeGreaterThan(index));
  await act(async () => {
    calls[index].gate.resolve({ error });
  });
}

function row(overrides: Partial<BoardRow> = {}): BoardRow {
  return {
    job_id: "job-a",
    company_name: "Coastal Demo Cleaning",
    site_name: "Palm Grove Practice",
    suburb: "Robina",
    service_name: "Standard clean",
    service_slug: "standard-clean",
    scheduled_start: "2026-08-19T20:00:00+00:00",
    duration_minutes: 90,
    cleaner_pay_cents: 9000,
    crew_size: 1,
    crew_slot: 1,
    my_application_status: null,
    ...overrides,
  };
}

const jobB = { job_id: "job-b", site_name: "Bond Tower", scheduled_start: "2026-08-20T20:00:00+00:00" };

function card(siteName: string) {
  const item = screen.getByText(new RegExp(`^${siteName} · `)).closest("li");
  if (!item) throw new Error(`no card rendered for ${siteName}`);
  return within(item);
}

beforeEach(() => {
  window.history.replaceState({}, "", "/en-AU/board");
  reads = [];
  calls = [];

  mocks.from.mockImplementation(() => ({
    select: () => ({
      order: () => {
        const gate = deferred<BoardResult>();
        reads.push(gate);
        return gate.promise;
      },
    }),
  }));

  mocks.rpc.mockImplementation((fn: string, args: { target_job_id: string }) => {
    const gate = deferred<RpcResult>();
    calls.push({ fn, jobId: args.target_job_id, gate });
    return gate.promise;
  });

  mocks.useCleaner.mockReturnValue({
    status: "allowed",
    profile: { id: "cleaner-1", full_name: "Ana Souza", suburb: "Robina" },
  });
});

describe("CLE-21 the board keeps a failure readable", () => {
  it("says why the tap failed even though the job has left the board", async () => {
    const user = userEvent.setup();
    render(<BoardPage />);
    await answerRead(0, [row()]);

    await user.click(screen.getByRole("button", { name: "Apply for job" }));
    await answerRpc(0, { message: "Job has no open slots" });
    // Someone else took the last slot: the view drops every row for the job, so the card
    // that owns the message unmounts in the same update that would render it.
    await answerRead(1, []);

    expect(screen.queryByText(/^Palm Grove Practice · /)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This job is full now.");
  });

  it("keeps the failure visible when the re-read fails too", async () => {
    const user = userEvent.setup();
    render(<BoardPage />);
    await answerRead(0, [row()]);

    await user.click(screen.getByRole("button", { name: "Apply for job" }));
    await answerRpc(0, { message: "Job is not available" });
    await answerRead(1, null, { message: "network down" });

    expect(screen.getByText("We could not load your jobs.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This job is not open to you any more.");
  });

  it("clears the board-level failure once she acts again", async () => {
    const user = userEvent.setup();
    render(<BoardPage />);
    await answerRead(0, [row(), row(jobB)]);

    await user.click(card("Palm Grove Practice").getByRole("button", { name: "Apply for job" }));
    await answerRpc(0, { message: "Job has no open slots" });
    await answerRead(1, [row(jobB)]);
    expect(screen.getByRole("alert")).toHaveTextContent("This job is full now.");

    await user.click(card("Bond Tower").getByRole("button", { name: "Apply for job" }));
    await answerRpc(1, null);
    await answerRead(2, [row({ ...jobB, my_application_status: "applied" })]);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("F15 board language changes", () => {
  it("reformats the current rows without fetching the board again", async () => {
    const user = userEvent.setup();
    render(
      <>
        <LanguageSwitcher />
        <BoardPage />
      </>,
    );
    await answerRead(0, [row()]);

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");

    await screen.findByRole("combobox", { name: "Idioma" });
    expect(reads).toHaveLength(1);
  });
});

describe("CLE-21 concurrent taps on different cards", () => {
  it("holds every in-flight card busy, not just the last one tapped", async () => {
    const user = userEvent.setup();
    render(<BoardPage />);
    await answerRead(0, [row(), row(jobB)]);

    await user.click(card("Palm Grove Practice").getByRole("button", { name: "Apply for job" }));
    await user.click(card("Bond Tower").getByRole("button", { name: "Apply for job" }));

    // Both applications are in flight, so neither card may offer a second tap.
    expect(screen.getAllByRole("button", { name: "Applying…" })).toHaveLength(2);

    await answerRpc(0, null);
    await answerRead(1, [row({ my_application_status: "applied" }), row(jobB)]);

    // The first application finishing must not re-enable the second card mid-flight.
    expect(card("Bond Tower").getByRole("button", { name: "Applying…" })).toBeDisabled();
  });

  it("discards a board read that resolves after a newer one", async () => {
    const user = userEvent.setup();
    render(<BoardPage />);
    await answerRead(0, [row(), row(jobB)]);

    await user.click(card("Palm Grove Practice").getByRole("button", { name: "Apply for job" }));
    await user.click(card("Bond Tower").getByRole("button", { name: "Apply for job" }));

    await answerRpc(0, null);
    await answerRpc(1, null);

    // The second read was issued last, so it carries the newer truth — answer it first,
    // then let the older read land late.
    await answerRead(2, [
      row({ my_application_status: "applied" }),
      row({ ...jobB, my_application_status: "applied" }),
    ]);
    await answerRead(1, [row({ my_application_status: "applied" }), row(jobB)]);

    expect(
      screen.getAllByText("Company will confirm — you are not assigned yet"),
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Apply for job" })).not.toBeInTheDocument();
  });
});

describe("CLE-21 a failure never contradicts the state beside it", () => {
  it("drops the message when the re-read explains the job itself", async () => {
    const user = userEvent.setup();
    render(<BoardPage />);
    await answerRead(0, [row()]);

    await user.click(screen.getByRole("button", { name: "Apply for job" }));
    await answerRpc(0, { message: "Cleaner can apply only once per job" });
    // Her board was stale: the application was already there. The card now says so itself.
    await answerRead(1, [row({ my_application_status: "applied" })]);

    expect(
      screen.getByText("Company will confirm — you are not assigned yet"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the message when the job is unchanged and the failure still stands", async () => {
    const user = userEvent.setup();
    render(<BoardPage />);
    await answerRead(0, [row()]);

    await user.click(screen.getByRole("button", { name: "Apply for job" }));
    await answerRpc(0, { message: "deadlock detected" });
    await answerRead(1, [row()]);

    expect(card("Palm Grove Practice").getByRole("alert")).toHaveTextContent(
      "We could not send your application. Try again.",
    );
    expect(
      card("Palm Grove Practice").getByRole("button", { name: "Apply for job" }),
    ).toBeEnabled();
  });
});

describe("Option C applied work is one status band", () => {
  it("keeps the applied heading and every applied row inside the full-width band", async () => {
    render(<BoardPage />);
    await answerRead(0, [
      row({ my_application_status: "applied" }),
      row({ ...jobB, my_application_status: "applied" }),
    ]);

    const heading = screen.getByRole("heading", { name: "Applied" });
    const section = heading.closest("section");

    expect(section).toHaveClass("board-section--applied");
    expect(within(section!).getByRole("list", { name: "Applied jobs" })).toContainElement(
      screen.getByText(/^Palm Grove Practice · /).closest("li"),
    );
    expect(within(section!).getAllByText("Company will confirm — you are not assigned yet")).toHaveLength(
      2,
    );
  });
});
