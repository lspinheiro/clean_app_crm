import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { CrmHeader } from "./crm-header";

describe("CrmHeader", () => {
  beforeEach(cleanup);

  it("does not advertise job creation before the workflow ships", () => {
    render(<CrmHeader companyName="Coastal Demo Cleaning" logoUrl={null} />);

    expect(screen.queryByText("+ New job")).not.toBeInTheDocument();
  });
});
