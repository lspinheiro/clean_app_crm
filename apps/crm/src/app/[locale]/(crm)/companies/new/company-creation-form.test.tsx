import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/company-creation", () => ({
  createCompanyAction: vi.fn(),
}));

import { CompanyCreationForm } from "./company-creation-form";

describe("CompanyCreationForm", () => {
  afterEach(() => {
    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });

  it("collects company identity and explains the first-owner result", () => {
    render(<CompanyCreationForm activeCompanyName="Coastal Demo Cleaning" />);

    expect(screen.getByRole("heading", { name: "Create a new company" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Company name" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "ABN" })).toHaveAttribute(
      "inputmode",
      "numeric",
    );
    expect(screen.getByText(/you will become the first owner/i)).toBeInTheDocument();
    expect(screen.getByText(/add a company logo later/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Coastal Demo Cleaning" }))
      .toHaveAttribute("href", "/roster");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/roster");
  });

  it("renders the workflow in Brazilian Portuguese without translating company names", () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";

    render(<CompanyCreationForm activeCompanyName="Coastal Demo Cleaning" />);

    expect(screen.getByRole("heading", { name: "Criar uma nova empresa" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar para Coastal Demo Cleaning" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar empresa" })).toBeInTheDocument();
  });
});
