import { cleanup, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { RosterWeek } from "./roster-week";
import { buildRosterDays } from "@/features/roster/calendar";
import { buildCleanerRoster, buildSiteRoster } from "@/features/roster/model";
import type { RosterModel } from "@/features/roster/types";

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
      recurringAssignmentId: null,
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
        view="cleaner"
        weekStart="2026-08-10"
        todayKey="2026-08-12"
      />,
    );

    const grid = screen.getByRole("region", { name: "Roster by cleaner" });
    expect(within(grid).getByText("Unfilled slots")).toBeInTheDocument();
    expect(within(grid).getByText("Vacancies to fill")).toBeInTheDocument();
    expect(within(grid).queryByText("Vacancy view")).not.toBeInTheDocument();
    expect(within(grid).getByText("Ana Costa")).toBeInTheDocument();
    expect(within(grid).getByText("Bea Lima")).toBeInTheDocument();
    expect(within(grid).getAllByTestId("roster-gap")).toHaveLength(1);
    expect(within(grid).getAllByText("Harbour Tower")).toHaveLength(2);
    expect(within(grid).getByText("2 cleaners")).toBeInTheDocument();
    expect(screen.getByTestId("roster-gap-count")).toHaveTextContent("1 unfilled slot");
    expect(screen.getByTestId("roster-footer-gap-count")).toHaveTextContent(
      "1 unfilled slot this week",
    );
    expect(screen.getByRole("button", { name: "Offer to cleaners" })).toBeDisabled();
    expect(screen.getByText("Available after the cleaner job board launches.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Previous week" })).toHaveAttribute(
      "href",
      "/roster?week=2026-08-03",
    );
  });

  it("renders offered work as a distinct state without reducing the delivered gap count", () => {
    const model: RosterModel = {
      rows: [
        {
          id: "gaps",
          label: "Unfilled slots",
          kind: "gaps",
          cells: {
            "2026-08-11": [{
              kind: "gap",
              key: "job-1:2",
              jobId: "job-1",
              siteName: "Harbour Tower",
              scheduledStart: "2026-08-11T00:00:00Z",
              crewSlot: 2,
              crewSize: 2,
            }],
          },
        },
        {
          id: "cleaner:cleaner-1",
          label: "Ana Costa",
          kind: "cleaner",
          cells: {
            "2026-08-11": [{
              kind: "offered",
              key: "offer:offer-1:job-1",
              jobId: "job-1",
              siteName: "Harbour Tower",
              scheduledStart: "2026-08-11T00:00:00Z",
              crewSize: 2,
              cleanerName: "Ana Costa",
            }],
          },
        },
      ],
      vacancyCount: 1,
      vacancyKeys: ["job-1:2"],
      jobIds: ["job-1"],
    };

    render(
      <RosterWeek
        days={days}
        hasFoundation
        model={model}
        view="cleaner"
        weekStart="2026-08-10"
        todayKey="2026-08-12"
      />,
    );

    const offered = screen.getByTestId("roster-offered");
    expect(offered).toHaveClass("roster-entry--offered");
    expect(offered).toHaveTextContent("OFFERED");
    expect(offered).toHaveTextContent("Harbour Tower");
    expect(offered).not.toHaveClass("roster-entry--job", "roster-entry--gap");
    expect(screen.getAllByTestId("roster-gap")).toHaveLength(1);
    expect(screen.getByTestId("roster-gap-count")).toHaveTextContent("1 unfilled slot");
    expect(screen.getByTestId("roster-footer-gap-count")).toHaveTextContent(
      "1 unfilled slot this week",
    );
  });

  it("links every entry kind to its own job page", () => {
    const model: RosterModel = {
      rows: [
        {
          id: "gaps",
          label: "Unfilled slots",
          kind: "gaps",
          cells: {
            "2026-08-11": [{
              kind: "gap",
              key: "job-3:2",
              jobId: "job-3",
              siteName: "Harbour Tower",
              scheduledStart: "2026-08-11T00:00:00Z",
              crewSlot: 2,
              crewSize: 2,
            }],
          },
        },
        {
          id: "cleaner:cleaner-1",
          label: "Ana Costa",
          kind: "cleaner",
          cells: {
            "2026-08-11": [{
              kind: "job",
              key: "job-1",
              jobId: "job-1",
              siteName: "Harbour Tower",
              scheduledStart: "2026-08-11T00:00:00Z",
              crewSize: 1,
              cleanerNames: ["Ana Costa"],
            }],
            "2026-08-12": [{
              kind: "offered",
              key: "offer:offer-1:job-2",
              jobId: "job-2",
              siteName: "Quiet Retail",
              scheduledStart: "2026-08-12T00:00:00Z",
              crewSize: 1,
              cleanerName: "Ana Costa",
            }],
          },
        },
      ],
      vacancyCount: 1,
      vacancyKeys: ["job-3:2"],
      jobIds: ["job-1", "job-2", "job-3"],
    };

    render(
      <RosterWeek
        days={days}
        hasFoundation
        model={model}
        view="cleaner"
        weekStart="2026-08-10"
        todayKey="2026-08-12"
      />,
    );

    const job = screen.getByTestId("roster-job");
    expect(job).toHaveRole("link");
    expect(job).toHaveAttribute("href", "/jobs/job-1");

    const offered = screen.getByTestId("roster-offered");
    expect(offered).toHaveRole("link");
    expect(offered).toHaveAttribute("href", "/jobs/job-2");

    const gap = screen.getByTestId("roster-gap");
    expect(gap).toHaveRole("link");
    expect(gap).toHaveAttribute("href", "/jobs/job-3");
  });

  it("renders a neutral unscheduled state when the week has no generated jobs", () => {
    const model = buildCleanerRoster({
      days,
      cleaners: [{ id: "cleaner-1", name: "Ana Costa" }],
      jobs: [],
      assignments: [],
      vacancies: [],
    });
    render(
      <RosterWeek
        days={days}
        hasFoundation
        model={model}
        view="cleaner"
        weekStart="2026-08-10"
        todayKey="2026-08-12"
      />,
    );
    expect(screen.getAllByText("No work")).toHaveLength(7);
    expect(
      document.querySelectorAll('.roster-no-work [aria-hidden="true"]'),
    ).toHaveLength(7);
    const pill = screen.getByTestId("roster-gap-count");
    expect(pill).toHaveTextContent("Nothing scheduled");
    expect(pill).not.toHaveClass("is-clear");
    const footer = screen.getByTestId("roster-footer-gap-count");
    expect(footer).toHaveAttribute("data-gap-state", "unscheduled");
    expect(footer).toHaveTextContent(
      "Nothing scheduled this week yet. Recurring jobs are generated 4 weeks ahead.",
    );
    expect(footer.querySelector(".lucide-check")).not.toBeInTheDocument();
    expect(footer.querySelector(".lucide-triangle-alert")).not.toBeInTheDocument();
  });

  it("keeps the green clear state for a covered week", () => {
    const model = buildCleanerRoster({
      days,
      cleaners: [{ id: "cleaner-1", name: "Ana Costa" }],
      jobs: [{
        id: "job-1",
        siteId: "site-1",
        siteName: "Harbour Tower",
        scheduledStart: "2026-08-09T22:00:00Z",
        crewSize: 1,
        recurringAssignmentId: null,
      }],
      assignments: [{ jobId: "job-1", cleanerId: "cleaner-1", slotNumber: 1 }],
      vacancies: [],
    });
    render(
      <RosterWeek
        days={days}
        hasFoundation
        model={model}
        view="cleaner"
        weekStart="2026-08-10"
        todayKey="2026-08-12"
      />,
    );
    const pill = screen.getByTestId("roster-gap-count");
    expect(pill).toHaveTextContent("0 unfilled slots");
    expect(pill).toHaveClass("is-clear");
    const footer = screen.getByTestId("roster-footer-gap-count");
    expect(footer).toHaveAttribute("data-gap-state", "clear");
    expect(footer).toHaveTextContent("0 unfilled slots this week");
    expect(footer.querySelector(".lucide-check")).toBeInTheDocument();
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
        view="cleaner"
        weekStart="2026-08-10"
        todayKey="2026-08-12"
      />,
    );
    expect(screen.getByRole("heading", { name: "Build your roster foundation" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Roster by cleaner" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("roster-footer-gap-count")).not.toBeInTheDocument();
    expect(screen.queryByTestId("roster-gap-count")).not.toBeInTheDocument();
  });

  it("marks today's column and hides the return link inside the current week", () => {
    render(
      <RosterWeek
        days={days}
        hasFoundation
        model={populatedModel()}
        view="cleaner"
        weekStart="2026-08-10"
        todayKey="2026-08-12"
      />,
    );
    expect(screen.getByRole("columnheader", { name: /Wed 12/ })).toHaveAttribute(
      "aria-current",
      "date",
    );
    expect(screen.queryByRole("link", { name: "This week" })).not.toBeInTheDocument();
  });

  it("offers a return to the current week when viewing another week", () => {
    render(
      <RosterWeek
        days={days}
        hasFoundation
        model={populatedModel()}
        view="site"
        weekStart="2026-08-10"
        todayKey="2026-09-16"
      />,
    );
    expect(document.querySelector('[aria-current="date"]')).toBeNull();
    expect(screen.getByRole("link", { name: "This week" })).toHaveAttribute(
      "href",
      "/roster?week=2026-09-14&view=site",
    );
  });

  it("disambiguates same-name sites with their client in the row header", () => {
    const model = buildSiteRoster({
      days,
      cleaners: [],
      sites: [
        { id: "site-1", name: "Harbour North", clientName: "Harbour Offices" },
        { id: "site-2", name: "Harbour North", clientName: "Oceanview Property Group" },
      ],
      jobs: [],
      assignments: [],
      vacancies: [],
    });
    render(
      <RosterWeek
        days={days}
        hasFoundation
        model={model}
        view="site"
        weekStart="2026-08-10"
        todayKey="2026-08-12"
      />,
    );
    const grid = screen.getByRole("region", { name: "Roster by site" });
    const headers = within(grid).getAllByRole("rowheader", { name: /Harbour North/ });
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent("Harbour Offices");
    expect(headers[1]).toHaveTextContent("Oceanview Property Group");
  });

  it("switches to site rows without losing the selected week", () => {
    const model = buildSiteRoster({
      days,
      cleaners: [{ id: "cleaner-1", name: "Ana Costa" }],
      sites: [
        { id: "site-1", name: "Harbour Tower", clientName: "Oceanview Property Group" },
        { id: "site-2", name: "Quiet Retail", clientName: "Oceanview Property Group" },
      ],
      jobs: [{
        id: "job-1",
        siteId: "site-1",
        siteName: "Harbour Tower",
        scheduledStart: "2026-08-09T22:00:00Z",
        crewSize: 2,
        recurringAssignmentId: null,
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
    render(
      <RosterWeek
        days={days}
        hasFoundation
        model={model}
        view="site"
        weekStart="2026-08-10"
        todayKey="2026-08-12"
      />,
    );

    const grid = screen.getByRole("region", { name: "Roster by site" });
    expect(within(grid).getByRole("columnheader", { name: "Site" })).toBeVisible();
    expect(within(grid).getByText("Ana Costa")).toBeVisible();
    expect(within(within(grid).getByRole("row", { name: /Quiet Retail/ }))
      .getAllByText("No work")).toHaveLength(7);
    expect(screen.getByRole("link", { name: "By site" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "By cleaner" })).toHaveAttribute(
      "href",
      "/roster?week=2026-08-10",
    );
    expect(screen.getByRole("link", { name: "Next week" })).toHaveAttribute(
      "href",
      "/roster?week=2026-08-17&view=site",
    );
  });
});
