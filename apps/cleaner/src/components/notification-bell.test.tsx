import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CleanerNotificationRow } from "@/features/notifications/model";
import { createSupabaseHarness } from "@/test/supabase";
import { renderWithCleanerIntl as render } from "@/test/render";

const CLEANER_ID = "cleaner-1";

/** Exactly what `cleaner_notifications` carries — no address, no access notes. */
const viewColumns = [
  "notification_id",
  "job_id",
  "type",
  "read_at",
  "created_at",
  "company_name",
  "site_name",
  "suburb",
  "service_name",
  "service_slug",
  "scheduled_start",
];

const mocks = vi.hoisted(() => {
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  return {
    channel,
    createChannel: vi.fn(() => channel),
    harness: null as ReturnType<typeof createSupabaseHarness<never>> | null,
    realtime: null as ((payload?: unknown) => void) | null,
    refresh: vi.fn(),
    removeChannel: vi.fn(),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: mocks.harness!.from,
    rpc: mocks.harness!.rpc,
    channel: mocks.createChannel,
    removeChannel: mocks.removeChannel,
    auth: { signOut: mocks.harness!.signOut },
  }),
}));

// ADR 0004 keeps this app a static export: there is no server render to invalidate, so a
// live notification has to reload the bell's own list. The spy stands guard over the CRM
// bell's router.refresh(), which would silently do nothing here.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => window.location.pathname,
}));

import { NotificationBell } from "./notification-bell";

function row(overrides: Partial<CleanerNotificationRow> = {}): CleanerNotificationRow {
  return {
    notification_id: "notification-1",
    job_id: "job-a",
    type: "job_assigned",
    read_at: null,
    created_at: "2026-08-25T00:01:00+00:00",
    company_name: "Coastal Demo Cleaning",
    site_name: "Palm Grove Practice",
    suburb: "Southport",
    service_name: "Standard clean",
    service_slug: "standard-clean",
    // 22:30 UTC is 8:30 the next morning in Brisbane, which has no daylight saving.
    scheduled_start: "2026-08-19T22:30:00+00:00",
    ...overrides,
  };
}

/** The job she was given: older of the two, so it sorts second. */
const assigned = row();

/** A job posted to the board a minute later, so it sorts first. */
const posted = row({
  notification_id: "notification-2",
  job_id: "job-b",
  type: "job_posted",
  created_at: "2026-08-25T00:02:00+00:00",
  site_name: "Bond Tower",
  suburb: "Robina",
  service_name: "Deep clean",
  service_slug: "deep-clean",
  scheduled_start: "2026-08-19T20:00:00+00:00",
});

const cancelled = row({
  notification_id: "notification-3",
  job_id: "job-c",
  type: "job_cancelled",
  created_at: "2026-08-24T23:30:00+00:00",
  site_name: "Harbour Suites",
});

const paid = row({
  notification_id: "notification-4",
  job_id: "job-d",
  type: "payment_marked_paid",
  created_at: "2026-08-24T23:00:00+00:00",
  site_name: "Marina Offices",
});

const twentyOneUnread = Array.from({ length: 21 }, (_, index) =>
  row({
    notification_id: `notification-${index + 1}`,
    job_id: `job-${index + 1}`,
    created_at: `2026-08-25T00:${String(59 - index).padStart(2, "0")}:00+00:00`,
  })
);

/** The same row as the database returns it once the bell has been opened. */
function seen(candidate: CleanerNotificationRow): CleanerNotificationRow {
  return { ...candidate, read_at: "2026-08-25T01:00:00+00:00" };
}

let harness: ReturnType<typeof createSupabaseHarness<CleanerNotificationRow>>;

beforeEach(() => {
  window.history.replaceState({}, "", "/en-AU/board");
  harness = createSupabaseHarness<CleanerNotificationRow>();
  mocks.harness = harness as unknown as ReturnType<typeof createSupabaseHarness<never>>;
  mocks.realtime = null;
  mocks.channel.on.mockImplementation((_event, _config, callback) => {
    mocks.realtime = callback;
    return mocks.channel;
  });
  mocks.channel.subscribe.mockReturnValue(mocks.channel);
});

async function answerBellLoad(
  loadIndex: number,
  rows: CleanerNotificationRow[] | null,
  error: { message: string } | null = null,
  unreadRows: CleanerNotificationRow[] | null = rows?.filter(
    (candidate) => candidate.read_at === null,
  ) ?? null,
) {
  const firstReadIndex = loadIndex * 2;
  await harness.answerRead(firstReadIndex, rows, error);
  await harness.answerRead(firstReadIndex + 1, unreadRows, error);
}

describe("CLE-90 a job arrives while the app is open", () => {
  it("raises the count with no refresh when a company gives her a job", async () => {
    render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, [assigned]);

    expect(screen.getByRole("button", { name: "Notifications, 1 unread" }))
      .toHaveTextContent("1");

    await act(async () => {
      mocks.realtime?.({ eventType: "INSERT" });
    });
    await answerBellLoad(1, [posted, assigned]);

    expect(screen.getByRole("button", { name: "Notifications, 2 unread" }))
      .toHaveTextContent("2");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("listens only for her own notifications and lets the channel go on unmount", async () => {
    const view = render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, []);

    expect(mocks.channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${CLEANER_ID}`,
      },
      expect.any(Function),
    );
    expect(mocks.channel.subscribe).toHaveBeenCalled();

    view.unmount();

    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });
});

describe("CLE-90 what the panel lists", () => {
  it("puts the newest first, with the clean, the site, the suburb, and the start time", async () => {
    const user = userEvent.setup();
    render(<NotificationBell profileId={CLEANER_ID} />);
    // Answered oldest-first on purpose: the order she sees is the bell's to guarantee.
    await answerBellLoad(0, [assigned, posted]);

    await user.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    await harness.answerUpdate(0, { error: null });

    const list = screen.getByRole("list", { name: "Notifications" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Bond Tower"),
      expect.stringContaining("Palm Grove Practice"),
    ]);
    expect(items[0]).toHaveTextContent("New job on the board");
    expect(items[0]).toHaveTextContent("Deep clean");
    expect(items[0]).toHaveTextContent("Robina");
    expect(items[0]).toHaveTextContent("6:00 am");
    expect(items[1]).toHaveTextContent("You were given a job");
    expect(items[1]).toHaveTextContent("Standard clean");
    expect(items[1]).toHaveTextContent("Southport");
    expect(items[1]).toHaveTextContent("8:30 am");
  });

  it("asks the cleaner view for only the columns the panel shows", async () => {
    render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, []);

    expect(harness.from).toHaveBeenCalledWith("cleaner_notifications");
    const read = harness.reads[0];
    expect(read.columns.split(",").map((column) => column.trim()).sort())
      .toEqual([...viewColumns].sort());
    expect(read.order).toEqual({ column: "created_at", options: { ascending: false } });
    expect(read.limit).toBe(20);
  });

  it("never shows a street address, even when one reaches the browser", async () => {
    const user = userEvent.setup();
    // The view carries no address at all; this row pretends one slipped in anyway, so a
    // panel that renders whatever the row holds fails here rather than in front of a client.
    const leaked = {
      ...assigned,
      address: "12 Bayview Rd, Robina QLD 4226",
      access_notes: "Side gate, key in lockbox",
    };
    render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, [leaked]);

    await user.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    await harness.answerUpdate(0, { error: null });

    expect(harness.reads[0].columns).not.toMatch(/address|access_notes/);
    expect(screen.getByRole("list", { name: "Notifications" }))
      .not.toHaveTextContent("12 Bayview Rd");
    expect(screen.queryByText(/Side gate/)).not.toBeInTheDocument();
  });

  it("offers a way to try again when her news cannot be read", async () => {
    const user = userEvent.setup();
    render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, null, { message: "network down" });

    // A silent empty bell would read as "no news", which is a different and wrong claim.
    const trigger = screen.getByRole("button", { name: "Notifications" });
    expect(trigger.textContent ?? "").not.toMatch(/\d/);

    await user.click(trigger);
    expect(screen.getByRole("alert")).toHaveTextContent("We could not load your news.");
    expect(screen.queryByText("No news yet.")).not.toBeInTheDocument();

    // The words are worth nothing without a control behind them: pressing it must issue a
    // second read and recover the bell.
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await answerBellLoad(1, [assigned]);

    expect(screen.getByRole("button", { name: "Notifications, 1 unread" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows loading rather than no news while the initial read is pending", async () => {
    const user = userEvent.setup();
    render(<NotificationBell profileId={CLEANER_ID} />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.queryByText("No news yet.")).not.toBeInTheDocument();

    await answerBellLoad(0, []);
  });

  it("keeps the news it already has when a later read fails", async () => {
    render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, [posted, assigned]);

    await act(async () => {
      mocks.realtime?.({ eventType: "INSERT" });
    });
    await answerBellLoad(1, null, { message: "network down" });

    // Blanking the badge here would tell her there is no unread news while the database
    // still holds two, at the exact moment something changed.
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("discards a list read that resolves after a newer one", async () => {
    render(<NotificationBell profileId={CLEANER_ID} />);

    // Two reads in flight at once: the mount read, and the one a live insert triggers.
    await act(async () => {
      mocks.realtime?.({ eventType: "INSERT" });
    });
    await answerBellLoad(1, [posted, assigned]);
    await answerBellLoad(0, [assigned]);

    // The newer answer stands; the stale mount read must not paint a pre-insert snapshot.
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" }))
      .toBeInTheDocument();
  });
});

describe("CLE-90 opening the bell clears the count", () => {
  it("counts and clears unread news outside the twenty-item history window", async () => {
    const user = userEvent.setup();
    render(<NotificationBell profileId={CLEANER_ID} />);

    await waitFor(() => expect(harness.reads).toHaveLength(2));
    expect(harness.reads[1]?.columns).toBe("notification_id");
    expect(harness.reads[1]?.is).toEqual({ column: "read_at", value: null });
    await answerBellLoad(0, twentyOneUnread.slice(0, 20), null, twentyOneUnread);

    const trigger = screen.getByRole("button", { name: "Notifications, 21 unread" });
    expect(trigger).toHaveTextContent("9+");
    await user.click(trigger);
    await harness.answerUpdate(0, { error: null });

    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(harness.updates[0]?.in).toEqual({
      column: "id",
      values: twentyOneUnread.map((candidate) => candidate.notification_id),
    });
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("marks every unread row read in the database and drops the badge", async () => {
    const user = userEvent.setup();
    render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, [posted, assigned]);

    await user.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    await harness.answerUpdate(0, { error: null });

    const update = harness.updates[0];
    expect(update.table).toBe("notifications");
    expect(update.values).toEqual({ read_at: expect.any(String) });
    expect(update.in?.column).toBe("id");
    expect([...(update.in?.values ?? [])].sort())
      .toEqual(["notification-1", "notification-2"]);
    // A row another device already marked keeps its own timestamp.
    expect(update.is).toEqual({ column: "read_at", value: null });

    const cleared = screen.getByRole("button", { name: "Notifications" });
    expect(cleared.textContent ?? "").not.toMatch(/\d/);
  });

  it("still shows nothing unread when she reopens the app", async () => {
    const user = userEvent.setup();
    const view = render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, [posted, assigned]);

    await user.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    await harness.answerUpdate(0, { error: null });

    // The write is the durable part. Re-reading to learn what it just wrote costs a round
    // trip on a phone and races the realtime re-read.
    expect(harness.reads).toHaveLength(2);

    view.unmount();
    render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(1, [seen(posted), seen(assigned)]);

    const reopened = screen.getByRole("button", { name: "Notifications" });
    expect(reopened.textContent ?? "").not.toMatch(/\d/);
  });

  it("keeps the count when the database refuses to mark them read", async () => {
    const user = userEvent.setup();
    render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, [posted, assigned]);

    await user.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    await harness.answerUpdate(0, { error: { message: "permission denied" } });

    // Clearing a badge the database still counts would lose the news on the next open.
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" }))
      .toBeInTheDocument();
  });
});

describe("CLE-90 where an item takes her", () => {
  it("opens the job board for a new job and My jobs for every other item", async () => {
    const user = userEvent.setup();
    render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, [
      seen(posted),
      seen(assigned),
      seen(cancelled),
      seen(paid),
    ]);

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    const list = screen.getByRole("list", { name: "Notifications" });
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(within(list).getByRole("link", { name: /New job on the board/ }))
      .toHaveAttribute("href", "/en-AU/board");
    expect(within(list).getByRole("link", { name: /You were given a job/ }))
      .toHaveAttribute("href", "/en-AU/my-jobs");
    expect(within(list).getByRole("link", { name: /A job was cancelled/ }))
      .toHaveAttribute("href", "/en-AU/my-jobs");
    expect(within(list).getByRole("link", { name: /A job was marked paid/ }))
      .toHaveAttribute("href", "/en-AU/my-jobs");
    expect(links.filter((link) => link.getAttribute("href") === "/en-AU/board"))
      .toHaveLength(1);
  });
});

describe("CLE-90 an empty bell", () => {
  it("says there is no news instead of opening an empty panel", async () => {
    const user = userEvent.setup();
    render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, []);

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(screen.getByText("No news yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("CLE-90 the same bell in Portuguese", () => {
  it("says every word of the panel in Portuguese", async () => {
    const user = userEvent.setup();
    render(<NotificationBell profileId={CLEANER_ID} />, { locale: "pt-BR" });
    await answerBellLoad(0, [posted, assigned]);

    await user.click(screen.getByRole("button", { name: "Notificações, 2 não lidas" }));
    await harness.answerUpdate(0, { error: null });

    const list = screen.getByRole("list", { name: "Notificações" });
    expect(within(list).getByRole("link", { name: /Novo serviço disponível/ }))
      .toHaveAttribute("href", "/pt-BR/board");
    expect(within(list).getByRole("link", { name: /Você recebeu um serviço/ }))
      .toHaveAttribute("href", "/pt-BR/my-jobs");
    expect(list).toHaveTextContent("Limpeza pesada");
    expect(list).toHaveTextContent("Robina");
    // Brisbane time either way; only the way it is written changes.
    expect(list).toHaveTextContent("06:00");
    expect(list).toHaveTextContent("08:30");
  });

  it("counts a single unread item with the Portuguese singular", async () => {
    render(<NotificationBell profileId={CLEANER_ID} />, { locale: "pt-BR" });
    await answerBellLoad(0, [assigned]);

    expect(screen.getByRole("button", { name: "Notificações, 1 não lida" }))
      .toBeInTheDocument();
  });

  it("says there is no news in Portuguese", async () => {
    const user = userEvent.setup();
    render(<NotificationBell profileId={CLEANER_ID} />, { locale: "pt-BR" });
    await answerBellLoad(0, []);

    await user.click(screen.getByRole("button", { name: "Notificações" }));

    expect(screen.getByText("Nenhuma novidade ainda.")).toBeInTheDocument();
  });
});

describe("CLE-90 the bell on a keyboard", () => {
  it("takes focus, closes on Escape, and hands focus back", async () => {
    const user = userEvent.setup();
    render(<NotificationBell profileId={CLEANER_ID} />);
    await answerBellLoad(0, [seen(posted)]);

    const trigger = screen.getByRole("button", { name: "Notifications" });
    const menu = trigger.closest("details");
    expect(menu).not.toBeNull();

    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    expect(menu).toHaveAttribute("open");

    // Focus has to be inside the panel for the hand-back to be observable. Clicking the
    // summary leaves focus on the summary itself, so asserting from there would pass even
    // if the implementation never restored focus at all.
    const firstItem = within(menu as HTMLElement).getByRole("link", {
      name: /New job on the board/,
    });
    firstItem.focus();
    expect(firstItem).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(menu).not.toHaveAttribute("open");
    // Focus left on a closed panel strands anyone not using a pointer.
    expect(trigger).toHaveFocus();
  });
});
