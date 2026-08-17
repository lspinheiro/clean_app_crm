import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { JobsList } from "./jobs-list";

describe("JobsList", () => {
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
          },
        ]}
      />,
    );

    expect(screen.getByText("Publicado")).toBeInTheDocument();
    expect(screen.getByText("1/2 posições preenchidas")).toBeInTheDocument();
  });
});
