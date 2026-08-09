import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobsList } from "./jobs-list";

describe("JobsList", () => {
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
          },
        ]}
      />,
    );

    const job = within(screen.getByRole("listitem"));
    expect(job.getByRole("heading", { name: "Broadbeach Towers" })).toBeInTheDocument();
    expect(job.getByText("Posted")).toBeInTheDocument();
    expect(job.getByText("1/2 assigned")).toBeInTheDocument();
    expect(job.getByText("$120")).toBeInTheDocument();
  });
});
