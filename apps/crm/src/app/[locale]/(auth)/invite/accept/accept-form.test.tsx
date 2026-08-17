import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/first-admin", () => ({
  acceptFirstAdminAction: vi.fn(),
  initialFirstAdminState: { fieldErrors: {}, formError: null },
}));

import { FirstAdminAcceptanceForm } from "./accept-form";

describe("FirstAdminAcceptanceForm", () => {
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
});
