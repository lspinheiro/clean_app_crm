import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCompanyLogoUrl: vi.fn(),
  requireCompanyAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));

vi.mock("@/lib/company-logo", () => ({
  getCompanyLogoUrl: mocks.getCompanyLogoUrl,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/roster",
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => {
    const channel = {
      on: vi.fn(),
      subscribe: vi.fn(),
    };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    return {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };
  },
}));

import CrmLayout from "./layout";

function emptyNotificationQuery() {
  const result = { data: [], error: null };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: <TResult1 = typeof result, TResult2 = never>(
      onFulfilled?: ((value: typeof result) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

describe("CRM layout accessibility", () => {
  it("puts the skip link before the site header and targets main content", async () => {
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "company-1", name: "Coastal Demo Cleaning", logo_path: null },
      membership: { company_id: "company-1", role: "owner" },
      memberships: [
        { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
      ],
      profile: {
        id: "10000000-0000-4000-8000-000000000001",
        full_name: "Taylor Admin",
      },
      supabase: { from: vi.fn(() => emptyNotificationQuery()) },
      user: { email: "taylor@example.com" },
    });
    mocks.getCompanyLogoUrl.mockResolvedValue(null);

    const { container } = render(await CrmLayout({ children: <p>Roster content</p> }));
    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    const header = container.querySelector("header");

    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(skipLink.compareDocumentPosition(header as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(document.querySelector("#main-content")).toHaveAttribute("tabindex", "-1");
  });

  it("loads newest application and decline notifications for the active company", async () => {
    const result = {
      data: [
        {
          id: "86000000-0000-4000-8000-000000000802",
          job_id: "22000000-0000-4000-8000-000000000502",
          type: "offer_declined",
          read_at: null,
          created_at: "2026-08-25T00:02:00Z",
          jobs: {
            sites: {
              name: "Southport Office",
              clients: { company_id: "company-1" },
            },
          },
        },
        {
          id: "86000000-0000-4000-8000-000000000801",
          job_id: "22000000-0000-4000-8000-000000000501",
          type: "application_received",
          read_at: null,
          created_at: "2026-08-25T00:01:00Z",
          jobs: {
            sites: {
              name: "Broadbeach Towers",
              clients: { company_id: "company-1" },
            },
          },
        },
      ],
      error: null,
    };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      then: <TResult1 = typeof result, TResult2 = never>(
        onFulfilled?: ((value: typeof result) => TResult1 | PromiseLike<TResult1>) | null,
        onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve(result).then(onFulfilled, onRejected),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const supabase = { from: vi.fn(() => query) };
    mocks.requireCompanyAdmin.mockResolvedValue({
      company: { id: "company-1", name: "Coastal Demo Cleaning", logo_path: null },
      membership: { company_id: "company-1", role: "owner" },
      memberships: [
        { companyId: "company-1", companyName: "Coastal Demo Cleaning", role: "owner" },
      ],
      profile: {
        id: "10000000-0000-4000-8000-000000000001",
        full_name: "Taylor Admin",
      },
      supabase,
      user: { email: "taylor@example.com" },
    });
    mocks.getCompanyLogoUrl.mockResolvedValue(null);

    render(await CrmLayout({ children: <p>Roster content</p> }));

    expect(supabase.from).toHaveBeenCalledWith("notifications");
    expect(query.eq).toHaveBeenCalledWith(
      "recipient_id",
      "10000000-0000-4000-8000-000000000001",
    );
    expect(query.in).toHaveBeenCalledWith("type", ["application_received", "offer_declined"]);
    expect(query.eq).toHaveBeenCalledWith("jobs.sites.clients.company_id", "company-1");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" }))
      .toBeInTheDocument();
  });
});
