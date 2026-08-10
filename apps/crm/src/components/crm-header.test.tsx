import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { CrmHeader } from "./crm-header";

describe("CrmHeader", () => {
  beforeEach(cleanup);

  it("leads with a skip link to the main content", () => {
    render(<CrmHeader companyName="Coastal Demo Cleaning" logoUrl={null} />);
    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(skipLink.compareDocumentPosition(screen.getByRole("navigation")))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("does not advertise job creation before the workflow ships", () => {
    render(<CrmHeader companyName="Coastal Demo Cleaning" logoUrl={null} />);

    expect(screen.queryByText("+ New job")).not.toBeInTheDocument();
  });
});
