import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptFirstAdminAction: vi.fn(),
}));

vi.mock("@/app/actions/first-admin", () => ({
  acceptFirstAdminAction: mocks.acceptFirstAdminAction,
}));

import { FirstAdminAcceptanceForm } from "./accept-form";

describe("FirstAdminAcceptanceForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.acceptFirstAdminAction.mockResolvedValue({
      fieldErrors: { abn: "Enter exactly 11 digits." },
      formError: null,
    });
  });

  it("shows the invited e-mail as read-only context and collects only S1 fields", () => {
    render(
      <FirstAdminAcceptanceForm
        defaultLocale="en-AU"
        inviteeEmail="admin@example.test"
      />,
    );

    expect(screen.getByText("admin@example.test")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveAttribute(
      "autocomplete",
      "name",
    );
    expect(screen.getByRole("textbox", { name: "Company name" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "ABN" })).toHaveAttribute(
      "inputmode",
      "numeric",
    );
    expect(screen.getByRole("textbox", { name: "Contact phone" })).toHaveAttribute(
      "autocomplete",
      "tel",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en-AU");
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/company id/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create company account" }).closest("form"))
      .toHaveAttribute("novalidate");
  });

  it("renders the complete acceptance copy in Brazilian Portuguese", () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";

    render(
      <FirstAdminAcceptanceForm
        defaultLocale="pt-BR"
        inviteeEmail="admin@example.test"
      />,
    );

    expect(screen.getByRole("textbox", { name: "Nome completo" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nome da empresa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar conta da empresa" })).toBeInTheDocument();

    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });

  it("preserves every entered value when the server action returns a validation error", async () => {
    const user = userEvent.setup();
    render(
      <FirstAdminAcceptanceForm
        defaultLocale="en-AU"
        inviteeEmail="admin@example.test"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Full name" }), "Ana Admin");
    await user.type(screen.getByRole("textbox", { name: "Company name" }), "Coast Clean");
    await user.type(screen.getByRole("textbox", { name: "ABN" }), "bad-abn");
    await user.type(screen.getByRole("textbox", { name: "Contact phone" }), "0412 345 678");
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");
    await user.type(screen.getByLabelText("Password"), "safe-password");
    await user.type(screen.getByLabelText("Confirm password"), "safe-password");
    await user.click(screen.getByRole("button", { name: "Create company account" }));

    await waitFor(() => {
      expect(screen.getByText("Enter exactly 11 digits.")).toBeInTheDocument();
    });
    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("Ana Admin");
    expect(screen.getByRole("textbox", { name: "Company name" })).toHaveValue("Coast Clean");
    expect(screen.getByRole("textbox", { name: "ABN" })).toHaveValue("bad-abn");
    expect(screen.getByRole("textbox", { name: "Contact phone" })).toHaveValue("0412 345 678");
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("pt-BR");
    expect(screen.getByLabelText("Password")).toHaveValue("safe-password");
    expect(screen.getByLabelText("Confirm password")).toHaveValue("safe-password");
  });
});
