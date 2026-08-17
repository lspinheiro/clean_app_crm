import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MoneyList } from "./money-list";

import type { CompanyMoneyLedger } from "@/features/money/types";

const ledger: CompanyMoneyLedger = {
  entries: [
    {
      amountCents: 12000,
      cleanerName: "Demo Cleaner One",
      id: "10000000-0000-4000-8000-000000000901",
      jobId: "10000000-0000-4000-8000-000000000801",
      scheduledStart: "2026-08-08T08:00:00+10:00",
      siteName: "Broadbeach Towers",
      status: "paid",
    },
    {
      amountCents: 12000,
      cleanerName: "Demo Cleaner Two",
      id: "10000000-0000-4000-8000-000000000902",
      jobId: "10000000-0000-4000-8000-000000000801",
      scheduledStart: "2026-08-08T08:00:00+10:00",
      siteName: "Broadbeach Towers",
      status: "owed",
    },
  ],
  owedCents: 12000,
  paidCents: 12000,
};

afterEach(cleanup);

describe("MoneyList", () => {
  it("renders a crew-two completion as two flat, linked entries", () => {
    render(<MoneyList ledger={ledger} />);

    const totals = screen.getByRole("region", { name: "Money totals" });
    expect(within(totals).getByText("Total owed").parentElement).toHaveTextContent(
      "$120.00",
    );
    expect(within(totals).getByText("Total paid").parentElement).toHaveTextContent(
      "$120.00",
    );

    const tableRegion = screen.getByRole("region", {
      name: "Company pay ledger table",
    });
    expect(tableRegion).toHaveAttribute("tabindex", "0");
    const table = screen.getByRole("table", { name: "Company pay ledger" });
    expect(tableRegion).toContainElement(table);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getAllByText("$120.00")).toHaveLength(2);
    expect(within(table).getByText("Demo Cleaner One")).toBeInTheDocument();
    expect(within(table).getByText("Demo Cleaner Two")).toBeInTheDocument();
    expect(within(table).getByText("Paid")).toHaveClass("money-status--paid");
    expect(within(table).getByText("Owed")).toHaveClass("money-status--owed");

    const links = within(table).getAllByRole("link", {
      name: /Job at Broadbeach Towers/,
    });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        "/jobs/10000000-0000-4000-8000-000000000801",
      );
    }
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/mark paid/i)).not.toBeInTheDocument();
  });

  it("shows zero totals and explains when completion history is empty", () => {
    render(
      <MoneyList
        ledger={{ entries: [], owedCents: 0, paidCents: 0 }}
      />,
    );

    expect(screen.getAllByText("$0.00")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "No pay history yet" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps unequal settlement totals under the correct labels", () => {
    render(
      <MoneyList
        ledger={{ entries: [], owedCents: 8500, paidCents: 12000 }}
      />,
    );

    const totals = screen.getByRole("region", { name: "Money totals" });
    expect(within(totals).getByText("Total owed").parentElement).toHaveTextContent(
      "$85.00",
    );
    expect(within(totals).getByText("Total paid").parentElement).toHaveTextContent(
      "$120.00",
    );
  });
});
