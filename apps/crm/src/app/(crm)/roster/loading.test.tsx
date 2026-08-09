import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RosterLoading from "./loading";

describe("RosterLoading", () => {
  it("announces busy state while keeping skeleton marks non-interactive", () => {
    const { container } = render(<RosterLoading />);
    expect(container.querySelector("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading roster");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".roster-loading__row")).toHaveLength(5);
  });
});
