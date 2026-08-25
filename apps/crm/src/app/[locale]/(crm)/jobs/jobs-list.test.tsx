import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return {
    channel,
    createClient: vi.fn(),
    refresh: vi.fn(),
    removeChannel: vi.fn(),
    realtimeCallback: null as null | (() => void),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: mocks.createClient,
}));

import { JobsList } from "./jobs-list";

describe("JobsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.realtimeCallback = null;
    mocks.channel.on.mockImplementation((_kind, _config, callback) => {
      mocks.realtimeCallback = callback;
      return mocks.channel;
    });
    mocks.channel.subscribe.mockReturnValue(mocks.channel);
    mocks.createClient.mockReturnValue({
      channel: vi.fn(() => mocks.channel),
      removeChannel: mocks.removeChannel,
    });
  });

  afterEach(() => {
    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });

  it("renders status and assignment counts for each crew-sized job", () => {
    render(
      <JobsList
        jobs={[
          {
            id: "job-1",
            siteName: "Broadbeach Towers",
            clientName: "Oceanview Property Group",
            serviceName: "Standard clean",
            scheduledStart: "2026-08-09T22:00:00Z",
            durationMinutes: 120,
            cleanerPayCents: 12000,
            status: "posted",
            crewSize: 2,
            assignedSlots: 1,
            awaitingApplications: 3,
          },
        ]}
      />,
    );

    const job = within(screen.getByRole("listitem"));
    expect(job.getByRole("link", { name: /Broadbeach Towers/ })).toHaveAttribute(
      "href",
      "/jobs/job-1",
    );
    expect(job.getByRole("heading", { name: "Broadbeach Towers" })).toBeInTheDocument();
    expect(job.getByText("Posted")).toBeInTheDocument();
    expect(job.getByText("1/2 assigned")).toBeInTheDocument();
    expect(job.getByText("3 awaiting review")).toBeInTheDocument();
    expect(job.getByText("$120")).toBeInTheDocument();
  });

  it("exercises the component through the Portuguese locale provider", () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";

    render(
      <JobsList
        jobs={[
          {
            id: "job-pt",
            siteName: "Broadbeach Towers",
            clientName: "Oceanview Property Group",
            serviceName: "Limpeza padrão",
            scheduledStart: "2026-08-09T22:00:00Z",
            durationMinutes: 120,
            cleanerPayCents: 12000,
            status: "posted",
            crewSize: 2,
            assignedSlots: 1,
            awaitingApplications: 3,
          },
        ]}
      />,
    );

    expect(screen.getByText("Publicado")).toBeInTheDocument();
    expect(screen.getByText("1/2 posições preenchidas")).toBeInTheDocument();
    expect(screen.getByText("3 aguardando análise")).toBeInTheDocument();
  });

  it("refreshes the live awaiting count when an authorised application changes", async () => {
    const { unmount } = render(
      <JobsList
        jobs={[{
          id: "22000000-0000-4000-8000-000000000501",
          siteName: "Broadbeach Towers",
          clientName: "Oceanview Property Group",
          serviceName: "Standard clean",
          scheduledStart: "2026-08-09T22:00:00Z",
          durationMinutes: 120,
          cleanerPayCents: 12000,
          status: "posted",
          crewSize: 2,
          assignedSlots: 1,
          awaitingApplications: 1,
        }]}
      />,
    );

    await waitFor(() => expect(mocks.channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "job_applications",
        filter: "job_id=in.(22000000-0000-4000-8000-000000000501)",
      },
      expect.any(Function),
    ));

    act(() => mocks.realtimeCallback?.());
    expect(mocks.refresh).toHaveBeenCalledOnce();

    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });
});
