import { cleanup, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { RosterWeek } from "./roster-week";
import { buildRosterDays } from "@/features/roster/calendar";
import { buildCleanerRoster } from "@/features/roster/model";

const days = buildRosterDays("2026-08-10");

function populatedModel() {
  return buildCleanerRoster({
    days,
    cleaners: [
      { id: "cleaner-1", name: "Ana Costa" },
      { id: "cleaner-2", name: "Bea Lima" },
    ],
    jobs: [{
      id: "job-1",
      siteId: "site-1",
      siteName: "Harbour Tower",
      scheduledStart: "2026-08-09T22:00:00Z",
      crewSize: 2,
    }],
    assignments: [{ jobId: "job-1", cleanerId: "cleaner-1", slotNumber: 1 }],
    vacancies: [{
      key: "job-1:2",
      jobId: "job-1",
      siteId: "site-1",
      siteName: "Harbour Tower",
      scheduledStart: "2026-08-09T22:00:00Z",
      crewSlot: 2,
      crewSize: 2,
    }],
  });
}

describe("RosterWeek", () => {
  beforeEach(cleanup);

  it("renders assigned work and each vacancy with identical summary counts", () => {
    render(
      <RosterWeek
        days={days}
        hasFoundation
        model={populatedModel()}
        weekStart="2026-08-10"
      />,
    );

    const grid = screen.getByRole("region", { name: "Roster by cleaner" });
    expect(within(grid).getByText("Unfilled slots")).toBeInTheDocument();
    expect(within(grid).getByText("Ana Costa")).toBeInTheDocument();
    expect(within(grid).getByText("Bea Lima")).toBeInTheDocument();
    expect(within(grid).getAllByTestId("roster-gap")).toHaveLength(1);
    expect(within(grid).getAllByText("Harbour Tower")).toHaveLength(2);
    expect(within(grid).getByText("2 cleaners")).toBeInTheDocument();
    expect(screen.getByTestId("roster-gap-count")).toHaveTextContent("1 unfilled slot");
    expect(screen.getByTestId("roster-footer-gap-count")).toHaveTextContent(
      "1 unfilled slot this week",
    );
    expect(screen.getByRole("button", { name: "Offer to pool" })).toBeDisabled();
    expect(screen.getByText("Available after the cleaner job board launches.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Previous week" })).toHaveAttribute(
      "href",
      "/roster?week=2026-08-03",
    );
  });

  it("keeps zero-work cleaners as seven explicit dash cells", () => {
    const model = buildCleanerRoster({
      days,
      cleaners: [{ id: "cleaner-1", name: "Ana Costa" }],
      jobs: [],
      assignments: [],
      vacancies: [],
    });
    render(
      <RosterWeek days={days} hasFoundation model={model} weekStart="2026-08-10" />,
    );
    expect(screen.getAllByLabelText("No work")).toHaveLength(7);
    expect(screen.getByTestId("roster-gap-count")).toHaveTextContent("0 unfilled slots");
    expect(screen.getByTestId("roster-footer-gap-count")).toHaveAttribute(
      "data-gap-state",
      "clear",
    );
    expect(
      screen.getByTestId("roster-footer-gap-count").querySelector(".lucide-triangle-alert"),
    ).not.toBeInTheDocument();
  });

  it("renders the pre-onboarding empty state without a false roster grid", () => {
    render(
      <RosterWeek
        days={days}
        hasFoundation={false}
        model={buildCleanerRoster({
          days,
          cleaners: [],
          jobs: [],
          assignments: [],
          vacancies: [],
        })}
        weekStart="2026-08-10"
      />,
    );
    expect(screen.getByRole("heading", { name: "Build your roster foundation" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Roster by cleaner" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("roster-footer-gap-count")).not.toBeInTheDocument();
  });
});
