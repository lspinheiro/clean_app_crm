import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CleanerNotificationRow } from "@/features/notifications/model";
import { CleanerIntlProvider } from "@/i18n/provider";
import { cleanerTestMessages } from "@/test/render";
import { createSupabaseHarness } from "@/test/supabase";

const mocks = vi.hoisted(() => {
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  return {
    channel,
    createChannel: vi.fn(() => channel),
    harness: null as ReturnType<typeof createSupabaseHarness<never>> | null,
    realtime: null as ((payload?: unknown) => void) | null,
    removeChannel: vi.fn(),
    replace: vi.fn(),
    signOut: vi.fn(),
    useCleaner: vi.fn(),
    usePathname: vi.fn(),
  };
});

vi.mock("@/lib/auth/use-cleaner", () => ({ useCleaner: mocks.useCleaner }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: mocks.usePathname,
}));
// The header carries the notification bell, which reads and subscribes on mount. A client
// double narrower than the shell's real surface makes every test here fail on a missing
// method rather than on the behaviour it is checking.
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: mocks.harness!.from,
    rpc: mocks.harness!.rpc,
    channel: mocks.createChannel,
    removeChannel: mocks.removeChannel,
    auth: { signOut: mocks.signOut },
  }),
}));

import CleanerLayout from "./layout";

function renderLayout(locale: "en-AU" | "pt-BR" = "en-AU") {
  return render(
    <CleanerIntlProvider initialLocale={locale} initialMessages={cleanerTestMessages[locale]}>
      <CleanerLayout>{null}</CleanerLayout>
    </CleanerIntlProvider>,
  );
}

let harness: ReturnType<typeof createSupabaseHarness<CleanerNotificationRow>>;

async function answerBellLoad(rows: CleanerNotificationRow[]) {
  await harness.answerRead(0, rows);
  await harness.answerRead(1, rows.filter((candidate) => candidate.read_at === null));
}

function unreadNews(): CleanerNotificationRow {
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
    scheduled_start: "2026-08-19T22:30:00+00:00",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  harness = createSupabaseHarness<CleanerNotificationRow>();
  mocks.harness = harness as unknown as ReturnType<typeof createSupabaseHarness<never>>;
  mocks.realtime = null;
  mocks.channel.on.mockImplementation((_event, _filter, callback) => {
    mocks.realtime = callback as (payload?: unknown) => void;
    return mocks.channel;
  });
  mocks.channel.subscribe.mockReturnValue(mocks.channel);
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.useCleaner.mockReturnValue({
    status: "allowed",
    profile: { id: "cleaner-1", full_name: "Ana Souza", suburb: "Robina" },
  });
  mocks.usePathname.mockReturnValue("/en-AU/board");
});

describe("CLE-26 the cleaner app navigation", () => {
  it("offers the board, jobs, and profile tabs to a signed-in cleaner", () => {
    renderLayout();

    const board = screen.getByRole("link", { name: "Open jobs" });
    const myJobs = screen.getByRole("link", { name: "My jobs" });
    const profile = screen.getByRole("link", { name: "Profile" });

    expect(board).toHaveAttribute(
      "href",
      "/en-AU/board",
    );
    expect(myJobs).toHaveAttribute(
      "href",
      "/en-AU/my-jobs",
    );
    expect(profile).toHaveAttribute("href", "/en-AU/profile");
    expect(board.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(myJobs.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(profile.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Language" })).toBeInTheDocument();
  });

  it("marks the tab she is on so she can tell where she is", () => {
    mocks.usePathname.mockReturnValue("/en-AU/my-jobs");
    renderLayout();

    expect(screen.getByRole("link", { name: "My jobs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Open jobs" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows no tabs at all while the gate is still deciding", () => {
    mocks.useCleaner.mockReturnValue({ status: "checking" });
    renderLayout();

    expect(screen.queryByRole("link", { name: "Open jobs" })).not.toBeInTheDocument();
  });

  it("localises the signed-in navigation without changing its destinations", () => {
    mocks.usePathname.mockReturnValue("/pt-BR/board");
    renderLayout("pt-BR");

    expect(screen.getByRole("link", { name: "Serviços disponíveis" })).toHaveAttribute(
      "href",
      "/pt-BR/board",
    );
    expect(screen.getByRole("link", { name: "Meus serviços" })).toHaveAttribute(
      "href",
      "/pt-BR/my-jobs",
    );
    expect(screen.getByRole("link", { name: "Perfil" })).toHaveAttribute(
      "href",
      "/pt-BR/profile",
    );
    expect(screen.getByRole("combobox", { name: "Idioma" })).toHaveValue("pt-BR");
  });

  it("recovers the sign-out control and reports a failed sign out", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockResolvedValue({ error: new Error("network unavailable") });
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't sign you out. Try again.",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("also recovers when sign out throws a transport exception", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockRejectedValue(new TypeError("offline"));
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't sign you out. Try again.",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
});

describe("CLE-90 the shell carries the bell", () => {
  it("puts the cleaner's own news in the header", async () => {
    renderLayout();
    await answerBellLoad([unreadNews()]);

    expect(harness.from).toHaveBeenCalledWith("cleaner_notifications");
    expect(
      screen.getByRole("button", { name: "Notifications, 1 unread" }),
    ).toBeInTheDocument();
  });

  it("watches for news addressed to the signed-in cleaner", async () => {
    renderLayout();
    await answerBellLoad([]);

    // The filter is the only thing that proves the shell handed the bell the signed-in
    // cleaner rather than a hardcoded or absent identity.
    expect(mocks.channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: "recipient_id=eq.cleaner-1",
      }),
      expect.any(Function),
    );
  });
});
