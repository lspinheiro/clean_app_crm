import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CrmHeader } from "./crm-header";

const mocks = vi.hoisted(() => {
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  const updateQuery = {
    update: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
  };
  updateQuery.update.mockReturnValue(updateQuery);
  updateQuery.in.mockReturnValue(updateQuery);
  updateQuery.is.mockResolvedValue({ error: null });
  return {
    channel,
    createClient: vi.fn(),
    mockUsePathname: vi.fn(),
    realtimeCallback: null as null | (() => void),
    refresh: vi.fn(),
    removeChannel: vi.fn(),
    updateQuery,
  };
});

vi.mock("next/navigation", () => ({
  usePathname: mocks.mockUsePathname,
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: mocks.createClient,
}));

describe("CrmHeader", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.mockUsePathname.mockReturnValue("/roster");
    mocks.realtimeCallback = null;
    mocks.channel.on.mockImplementation((_kind, _config, callback) => {
      mocks.realtimeCallback = callback;
      return mocks.channel;
    });
    mocks.channel.subscribe.mockReturnValue(mocks.channel);
    mocks.updateQuery.update.mockReturnValue(mocks.updateQuery);
    mocks.updateQuery.in.mockReturnValue(mocks.updateQuery);
    mocks.updateQuery.is.mockResolvedValue({ error: null });
    mocks.createClient.mockReturnValue({
      channel: vi.fn(() => mocks.channel),
      from: vi.fn(() => mocks.updateQuery),
      removeChannel: mocks.removeChannel,
    });
  });

  it("does not advertise job creation before the workflow ships", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    expect(screen.queryByText("+ New job")).not.toBeInTheDocument();
  });

  it("keeps product identity and current company as separate header controls", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    expect(screen.getByRole("link", { name: "The Clean Crew home" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Current company: Coastal Demo Cleaning" }),
    ).toBeInTheDocument();
  });

  it("offers owner settings inside the account menu and marks it current", () => {
    mocks.mockUsePathname.mockReturnValue("/settings/identity");
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Account menu" });
    fireEvent.click(trigger);
    const accountMenu = trigger.closest("details");

    expect(within(accountMenu as HTMLElement).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getAllByRole("link", { name: "Settings" })).toHaveLength(1);
    expect(screen.queryByLabelText("Company settings")).not.toBeInTheDocument();
  });

  it("offers personal settings to staff", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "staff" },
        ]}
        profileName="Taylor Staff"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("closes the account menu on outside press or Escape", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Account menu" });
    const menu = trigger.closest("details");
    fireEvent.click(trigger);
    expect(menu).toHaveAttribute("open");

    fireEvent.pointerDown(document.body);

    expect(menu).not.toHaveAttribute("open");

    fireEvent.click(trigger);
    expect(menu).toHaveAttribute("open");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(menu).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("always exposes company context and creation outside the personal account menu", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    const companyTrigger = screen.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    });
    fireEvent.click(companyTrigger);
    expect(screen.getByRole("link", { name: "Create new company" })).toBeInTheDocument();
    expect(screen.queryByText("All companies")).not.toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    const accountTrigger = screen.getByRole("button", { name: "Account menu" });
    fireEvent.click(accountTrigger);
    const accountMenu = accountTrigger.closest("details");
    expect(accountMenu).not.toBeNull();
    expect(within(accountMenu as HTMLElement).queryByRole("group", { name: "Switch company" }))
      .not.toBeInTheDocument();
    expect(within(accountMenu as HTMLElement).queryByRole("link", { name: "Create new company" }))
      .not.toBeInTheDocument();
  });

  it("lists every active membership and its role in the company selector", () => {
    render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
          { companyId: "company-2", companyName: "Harbour Demo Cleaning", role: "staff" },
        ]}
        profileName="Taylor Admin"
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Current company: Coastal Demo Cleaning",
    }));
    const companyGroup = screen.getByRole("group", { name: "Your companies" });
    expect(within(companyGroup).getByText("Coastal Demo Cleaning", { exact: true }))
      .toBeInTheDocument();
    expect(within(companyGroup).getByText("Harbour Demo Cleaning", { exact: true }))
      .toBeInTheDocument();
    expect(within(companyGroup).getByText("Owner", { exact: true })).toBeInTheDocument();
    expect(within(companyGroup).getByText("Staff", { exact: true })).toBeInTheDocument();
  });

  it("shows durable application notifications, marks unread rows read, and refreshes live", async () => {
    const { unmount } = render(
      <CrmHeader
        companyId="company-1"
        companyName="Coastal Demo Cleaning"
        logoUrl={null}
        memberships={[
          { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
        ]}
        notifications={[
          {
            id: "86000000-0000-4000-8000-000000000802",
            jobId: "22000000-0000-4000-8000-000000000502",
            siteName: "Southport Office",
            createdAt: "2026-08-25T00:02:00Z",
            readAt: null,
          },
          {
            id: "86000000-0000-4000-8000-000000000801",
            jobId: "22000000-0000-4000-8000-000000000501",
            siteName: "Broadbeach Towers",
            createdAt: "2026-08-25T00:01:00Z",
            readAt: null,
          },
        ]}
        profileId="10000000-0000-4000-8000-000000000001"
        profileName="Taylor Admin"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Notifications, 2 unread" });
    expect(trigger).toHaveTextContent("2");
    fireEvent.click(trigger);

    const list = screen.getByRole("list", { name: "Notifications" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent))
      .toEqual([
        expect.stringContaining("Southport Office"),
        expect.stringContaining("Broadbeach Towers"),
      ]);
    expect(within(list).getByRole("link", { name: /Broadbeach Towers/ }))
      .toHaveAttribute("href", "/jobs/22000000-0000-4000-8000-000000000501#applications");

    await vi.waitFor(() => expect(mocks.updateQuery.update).toHaveBeenCalledWith({
      read_at: expect.any(String),
    }));
    expect(mocks.updateQuery.in).toHaveBeenCalledWith("id", [
      "86000000-0000-4000-8000-000000000802",
      "86000000-0000-4000-8000-000000000801",
    ]);
    expect(mocks.updateQuery.is).toHaveBeenCalledWith("read_at", null);

    expect(mocks.channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: "type=eq.application_received",
      },
      expect.any(Function),
    );
    mocks.realtimeCallback?.();
    expect(mocks.refresh).toHaveBeenCalled();

    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });

});
