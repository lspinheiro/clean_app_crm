import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("uses the translated server validation instead of browser-native messages", () => {
    render(<LoginForm />);

    expect(screen.getByRole("button", { name: "Sign in" }).closest("form"))
      .toHaveAttribute("novalidate");
  });
});
