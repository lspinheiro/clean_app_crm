import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RosterLoading from "./loading";

describe("RosterLoading", () => {
  it("announces busy state while keeping skeleton marks non-interactive", () => {
    const { container } = render(<RosterLoading />);
    const main = container.querySelector("main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(main).toHaveAttribute("aria-label", "Loading roster");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("roster-loading-week-controls")).toBeInTheDocument();
    expect(screen.getByTestId("roster-loading-view-switch")).toBeInTheDocument();
    expect(screen.getByTestId("roster-loading-gap-count")).toBeInTheDocument();
    expect(container.querySelectorAll(".roster-loading__row")).toHaveLength(6);
  });
});
