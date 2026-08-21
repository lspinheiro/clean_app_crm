import { describe, expect, it } from "vitest";

import { toVacancies } from "./model";
import type { BoardRow } from "./types";

function row(overrides: Partial<BoardRow> = {}): BoardRow {
  return {
    job_id: "job-1",
    company_name: "Coastal Demo Cleaning",
    site_name: "Palm Grove Practice",
    suburb: "Robina",
    service_name: "Standard clean",
    scheduled_start: "2026-08-19T20:00:00+00:00",
    duration_minutes: 90,
    cleaner_pay_cents: 9000,
    crew_size: 1,
    crew_slot: 1,
    my_application_status: null,
    ...overrides,
  };
}

describe("CLE-20 board vacancies", () => {
  it("has nothing to show for an empty board", () => {
    expect(toVacancies([])).toEqual([]);
  });

  it("carries the job's display fields through", () => {
    expect(toVacancies([row()])).toEqual([
      {
        jobId: "job-1",
        companyName: "Coastal Demo Cleaning",
        siteName: "Palm Grove Practice",
        suburb: "Robina",
        serviceName: "Standard clean",
        scheduledStart: "2026-08-19T20:00:00+00:00",
        durationMinutes: 90,
        cleanerPayCents: 9000,
        crewSize: 1,
        openSlots: 1,
        applicationStatus: null,
      },
    ]);
  });

  it("carries her own application status through, so the card can show a waiting state", () => {
    const vacancies = toVacancies([row({ my_application_status: "applied" })]);

    expect(vacancies[0]).toMatchObject({ applicationStatus: "applied" });
  });

  it("keeps the application status when a crew job collapses to one card", () => {
    // The status comes from a left join on her own application, so every slot row of the
    // same job carries it identically; collapsing must not drop it.
    const vacancies = toVacancies([
      row({ crew_size: 2, crew_slot: 1, my_application_status: "applied" }),
      row({ crew_size: 2, crew_slot: 2, my_application_status: "applied" }),
    ]);

    expect(vacancies).toHaveLength(1);
    expect(vacancies[0]).toMatchObject({ openSlots: 2, applicationStatus: "applied" });
  });

  it("shows a two-cleaner job once, counting both open slots", () => {
    const vacancies = toVacancies([
      row({ crew_size: 2, crew_slot: 1 }),
      row({ crew_size: 2, crew_slot: 2 }),
    ]);

    expect(vacancies).toHaveLength(1);
    expect(vacancies[0]).toMatchObject({ crewSize: 2, openSlots: 2 });
  });

  it("counts only the slots still open when one is already filled", () => {
    // The view drops assigned slots, so a filled slot simply never arrives.
    const vacancies = toVacancies([row({ crew_size: 2, crew_slot: 2 })]);

    expect(vacancies).toHaveLength(1);
    expect(vacancies[0]).toMatchObject({ crewSize: 2, openSlots: 1 });
  });

  it("keeps every company's work, not just the first company's", () => {
    const vacancies = toVacancies([
      row({ job_id: "job-a", company_name: "Coastal Demo Cleaning" }),
      row({ job_id: "job-b", company_name: "Broadbeach Bond Co" }),
    ]);

    // Ordering is the next test's job; this one only cares that neither company is dropped.
    expect(vacancies).toHaveLength(2);
    expect(vacancies.map((vacancy) => vacancy.companyName).sort()).toEqual([
      "Broadbeach Bond Co",
      "Coastal Demo Cleaning",
    ]);
  });

  it("puts the soonest job first, whichever company it belongs to", () => {
    const vacancies = toVacancies([
      row({ job_id: "later", scheduled_start: "2026-08-21T20:00:00+00:00" }),
      row({
        job_id: "sooner",
        company_name: "Broadbeach Bond Co",
        scheduled_start: "2026-08-19T20:00:00+00:00",
      }),
    ]);

    expect(vacancies.map((vacancy) => vacancy.jobId)).toEqual(["sooner", "later"]);
  });

  it("orders jobs that start together by company and site, so the list never shuffles", () => {
    const start = "2026-08-19T20:00:00+00:00";
    const vacancies = toVacancies([
      row({ job_id: "b", company_name: "Zenith Cleaning", site_name: "Alpha", scheduled_start: start }),
      row({ job_id: "c", company_name: "Alpha Cleaning", site_name: "Zulu", scheduled_start: start }),
      row({ job_id: "a", company_name: "Alpha Cleaning", site_name: "Alpha", scheduled_start: start }),
    ]);

    expect(vacancies.map((vacancy) => vacancy.jobId)).toEqual(["a", "c", "b"]);
  });
});
