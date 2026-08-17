import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ErrorPage from "./error";

describe("locale error boundary", () => {
  it("renders a translated recovery action", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<ErrorPage error={new Error("test failure")} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    expect(screen.getByText("The page could not be loaded. Try again.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
