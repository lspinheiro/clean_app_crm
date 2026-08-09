import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CrmNavigation } from "./crm-navigation";

const expectedLinks = [
  ["Roster", "/roster"],
  ["Jobs", "/jobs"],
  ["Clients", "/clients"],
  ["Pool", "/pool"],
  ["Money", "/money"],
] as const;

describe("CLE-5 CRM shell navigation", () => {
  it("renders the five milestone shell destinations once", () => {
    render(<CrmNavigation />);

    for (const [label, href] of expectedLinks) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", href);
    }
  });
});
