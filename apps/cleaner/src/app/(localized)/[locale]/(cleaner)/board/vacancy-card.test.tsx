import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Vacancy } from "@/features/board/types";
import type { AppLocale } from "@/i18n/config";
import { renderWithCleanerIntl as render } from "@/test/render";

import { VacancyCard } from "./vacancy-card";

function vacancy(overrides: Partial<Vacancy> = {}): Vacancy {
  return {
    jobId: "job-1",
    companyName: "Coastal Demo Cleaning",
    siteName: "Palm Grove Practice",
    suburb: "Robina",
    serviceName: "Standard clean",
    serviceSlug: "standard-clean",
    scheduledStart: "2026-08-19T20:00:00+00:00",
    durationMinutes: 90,
    cleanerPayCents: 9000,
    crewSize: 1,
    openSlots: 1,
    applicationStatus: null,
    ...overrides,
  };
}

function renderCard(
  props: Partial<Parameters<typeof VacancyCard>[0]> = {},
  locale: AppLocale = "en-AU",
) {
  const onApply = vi.fn();
  const onWithdraw = vi.fn();

  render(
    <ul>
      <VacancyCard
        busy={false}
        error={null}
        onApply={onApply}
        onWithdraw={onWithdraw}
        vacancy={vacancy()}
        {...props}
      />
    </ul>,
    { locale },
  );

  return { onApply, onWithdraw };
}

describe("CLE-21 applying from the board", () => {
  it("offers one tap to apply on an open job", async () => {
    const { onApply } = renderCard();

    await userEvent.click(screen.getByRole("button", { name: "Apply for job" }));

    expect(onApply).toHaveBeenCalledWith("job-1");
  });

  it("shows a waiting state instead of a second apply button", () => {
    renderCard({ vacancy: vacancy({ applicationStatus: "applied" }) });

    expect(
      screen.getByText("Company will confirm — you are not assigned yet"),
    ).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Apply for job" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeEnabled();
  });

  it("withdraws the live application", async () => {
    const { onWithdraw } = renderCard({
      vacancy: vacancy({ applicationStatus: "applied" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    expect(onWithdraw).toHaveBeenCalledWith("job-1");
  });

  it("returns the card to the list after a withdrawal but refuses a second application", () => {
    renderCard({ vacancy: vacancy({ applicationStatus: "withdrawn" }) });

    // The job is still visible work, so the card stays — but the database will not take
    // another application, so the control must say so rather than fail on tap.
    expect(screen.getByText("Palm Grove Practice · Robina")).toBeInTheDocument();
    expect(screen.getByText("You withdrew from this job.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply for job" })).toBeDisabled();
    expect(
      screen.queryByText("Company will confirm — you are not assigned yet"),
    ).not.toBeInTheDocument();
  });

  it("cannot be tapped twice while the application is in flight", async () => {
    const { onApply } = renderCard({ busy: true });

    const apply = screen.getByRole("button", { name: "Applying…" });
    expect(apply).toBeDisabled();

    await userEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("says what went wrong in her own words", () => {
    renderCard({ error: "This job is full now." });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This job is full now.");
  });

  it("keeps the job facts visible in every state", () => {
    renderCard({ vacancy: vacancy({ applicationStatus: "applied", crewSize: 2, openSlots: 2 }) });

    expect(screen.getByText("Coastal Demo Cleaning")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 spots open")).toBeInTheDocument();
    expect(screen.getByText("$90")).toBeInTheDocument();
  });

  it("renders structured labels and built-in services in Brazilian Portuguese", () => {
    renderCard({}, "pt-BR");

    expect(
      screen.getByRole("button", { name: "Candidatar-se ao serviço" }),
    ).toBeEnabled();
    expect(screen.getByText(/Limpeza padrão/)).toBeInTheDocument();
    expect(screen.getByText("1 vaga aberta")).toBeInTheDocument();
    expect(screen.getByText("Coastal Demo Cleaning")).toBeInTheDocument();
  });
});
