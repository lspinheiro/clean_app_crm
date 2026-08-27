import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithCleanerIntl as render } from "@/test/render";
import { createSupabaseHarness } from "@/test/supabase";

type OfferRow = {
  offer_id: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  created_at: string;
  resolved_at: string | null;
  company_id: string;
  company_name: string;
  target_kind: string;
  job_id: string | null;
  recurring_assignment_id: string | null;
  site_name: string;
  suburb: string;
  service_id: string;
  service_name: string;
  service_slug: string | null;
  scheduled_start: string | null;
  weekday: number | null;
  local_start_time: string | null;
  frequency: "weekly" | "fortnightly" | null;
  duration_minutes: number;
  cleaner_pay_cents: number;
  crew_size: number;
};

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  replace: vi.fn(),
  rpc: vi.fn(),
  useCleaner: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/lib/auth/use-cleaner", () => ({ useCleaner: mocks.useCleaner }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

import OffersPage from "./page";

let harness: ReturnType<typeof createSupabaseHarness<OfferRow>>;

function jobRow(overrides: Partial<OfferRow> = {}): OfferRow {
  return {
    offer_id: "20000000-0000-4000-8000-000000000001",
    status: "pending",
    created_at: "2026-08-27T00:00:00+00:00",
    resolved_at: null,
    company_id: "30000000-0000-4000-8000-000000000001",
    company_name: "Coastal Demo Cleaning",
    target_kind: "job",
    job_id: "10000000-0000-4000-8000-000000000001",
    recurring_assignment_id: null,
    site_name: "Palm Grove Practice",
    suburb: "Robina",
    service_id: "40000000-0000-4000-8000-000000000001",
    service_name: "Standard clean",
    service_slug: "standard-clean",
    scheduled_start: "2026-08-19T20:00:00+00:00",
    weekday: null,
    local_start_time: null,
    frequency: null,
    duration_minutes: 90,
    cleaner_pay_cents: 9000,
    crew_size: 1,
    ...overrides,
  };
}

function seriesRow(overrides: Partial<OfferRow> = {}): OfferRow {
  return jobRow({
    offer_id: "20000000-0000-4000-8000-000000000002",
    target_kind: "recurring_assignment",
    job_id: null,
    recurring_assignment_id: "50000000-0000-4000-8000-000000000001",
    site_name: "Bond Tower",
    suburb: "Surfers Paradise",
    scheduled_start: null,
    weekday: 4,
    local_start_time: "06:00:00",
    frequency: "fortnightly",
    ...overrides,
  });
}

function offerCard(siteName: string) {
  const item = screen.getByText(new RegExp(`^${siteName} · `)).closest("li");
  if (!item) throw new Error(`no offer card rendered for ${siteName}`);
  return within(item);
}

beforeEach(() => {
  window.history.replaceState({}, "", "/en-AU/offers");
  harness = createSupabaseHarness<OfferRow>();
  mocks.from.mockImplementation(harness.from);
  mocks.rpc.mockImplementation(harness.rpc);
  mocks.useCleaner.mockReturnValue({
    status: "allowed",
    profile: { id: "cleaner-1", full_name: "Ana Souza", suburb: "Robina" },
  });
});

describe("CLE-57 waiting offers", () => {
  it("shows the work, concrete schedule, posted pay, and resolved history", async () => {
    render(<OffersPage />);
    await harness.answerRead(0, [
      jobRow(),
      jobRow({
        offer_id: "20000000-0000-4000-8000-000000000003",
        status: "accepted",
        resolved_at: "2026-08-27T01:00:00+00:00",
        site_name: "Harbour Dental",
      }),
    ]);

    expect(screen.getByRole("heading", { name: "Offers" })).toBeVisible();
    const pending = offerCard("Palm Grove Practice");
    expect(pending.getByText("Coastal Demo Cleaning")).toBeVisible();
    expect(pending.getByText(/Standard clean/)).toBeVisible();
    expect(pending.getByText(/Thu, 20 Aug at 6:00 am/)).toBeVisible();
    expect(pending.getByText("$90")).toBeVisible();
    expect(pending.getByRole("button", { name: "Accept offer" })).toBeEnabled();
    expect(pending.getByRole("button", { name: "Decline offer" })).toBeEnabled();

    const history = screen.getByRole("list", { name: "Offer history" });
    expect(within(history).getByText(/^Harbour Dental · /)).toBeVisible();
    expect(within(history).getByText("Accepted")).toBeVisible();
  });

  it("states the complete series shape and standing consent before acceptance", async () => {
    render(<OffersPage />);
    await harness.answerRead(0, [seriesRow()]);

    const offer = offerCard("Bond Tower");
    expect(offer.getByText(/Every second Thursday at 6:00 am/)).toBeVisible();
    expect(
      offer.getByText("Accepting covers all future jobs in this series."),
    ).toBeVisible();
  });

  it("ships natural Brazilian Portuguese for the series and its actions", async () => {
    render(<OffersPage />, { locale: "pt-BR" });
    await harness.answerRead(0, [seriesRow()]);

    const offer = offerCard("Bond Tower");
    expect(offer.getByText(/A cada duas semanas, quinta-feira, às 06:00/)).toBeVisible();
    expect(
      offer.getByText("Ao aceitar, você confirma todos os serviços futuros desta série."),
    ).toBeVisible();
    expect(offer.getByRole("button", { name: "Aceitar oferta" })).toBeEnabled();
    expect(offer.getByRole("button", { name: "Recusar oferta" })).toBeEnabled();
  });

  it("uses gender-neutral Brazilian Portuguese for a Saturday series", async () => {
    render(<OffersPage />, { locale: "pt-BR" });
    await harness.answerRead(0, [seriesRow({ weekday: 6, frequency: "weekly" })]);

    expect(offerCard("Bond Tower").getByText(/Toda semana, sábado, às 06:00/)).toBeVisible();
  });
});

describe("CLE-57 resolving an offer", () => {
  it("accepts in one tap, refreshes, and points to the new job", async () => {
    const user = userEvent.setup();
    render(<OffersPage />);
    await harness.answerRead(0, [jobRow()]);

    await user.click(screen.getByRole("button", { name: "Accept offer" }));

    expect(harness.calls[0]).toMatchObject({
      fn: "accept_offer",
      args: { target_offer_id: "20000000-0000-4000-8000-000000000001" },
    });
    expect(screen.getByRole("button", { name: "Accepting…" })).toBeDisabled();

    await harness.answerRpc(0, { error: null });
    await harness.answerRead(1, [
      jobRow({ status: "accepted", resolved_at: "2026-08-27T01:00:00+00:00" }),
    ]);

    expect(await screen.findByRole("status")).toHaveTextContent("Offer accepted.");
    expect(screen.getByRole("link", { name: "View my jobs" })).toHaveAttribute(
      "href",
      "/en-AU/my-jobs",
    );
    expect(screen.queryByRole("button", { name: "Accept offer" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Offer history" })).toBeVisible();
  });

  it("declines in one tap, confirms the result, and removes it from waiting offers", async () => {
    const user = userEvent.setup();
    render(<OffersPage />);
    await harness.answerRead(0, [jobRow()]);

    await user.click(screen.getByRole("button", { name: "Decline offer" }));
    expect(harness.calls[0]).toMatchObject({
      fn: "decline_offer",
      args: { target_offer_id: "20000000-0000-4000-8000-000000000001" },
    });

    await harness.answerRpc(0, { error: null });
    await harness.answerRead(1, [
      jobRow({ status: "declined", resolved_at: "2026-08-27T01:00:00+00:00" }),
    ]);

    expect(await screen.findByRole("status")).toHaveTextContent("Offer declined.");
    expect(screen.queryByRole("list", { name: "Waiting offers" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Offer history" })).toBeVisible();
  });

  it("shows the verbatim stale-offer error and refreshes the vanished offer away", async () => {
    const user = userEvent.setup();
    render(<OffersPage />);
    await harness.answerRead(0, [jobRow()]);

    await user.click(screen.getByRole("button", { name: "Accept offer" }));
    await harness.answerRpc(0, { error: { message: "Offer is no longer pending" } });
    await harness.answerRead(1, []);

    expect(await screen.findByRole("alert")).toHaveTextContent("Offer is no longer pending");
    expect(screen.queryByText(/^Palm Grove Practice · /)).not.toBeInTheDocument();
    expect(harness.reads).toHaveLength(2);
  });
});

describe("CLE-57 trust boundaries", () => {
  it("rejects an unknown target kind instead of guessing a schedule shape", async () => {
    render(<OffersPage />);
    await harness.answerRead(0, [
      { ...jobRow(), target_kind: "shift" },
    ]);

    expect(screen.getByText("We could not load your offers.")).toBeVisible();
    expect(screen.queryByText(/^Palm Grove Practice · /)).not.toBeInTheDocument();
  });

  it("routes an expired session back to sign-in", async () => {
    render(<OffersPage />);
    await harness.answerRead(0, null, { message: "JWT expired" });

    expect(mocks.replace).toHaveBeenCalledWith("/en-AU/login");
  });
});
