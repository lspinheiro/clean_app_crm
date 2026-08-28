import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptEmployeeInvitationAction: vi.fn(),
}));

vi.mock("@/app/actions/employee-invitations", () => ({
  acceptEmployeeInvitationAction: mocks.acceptEmployeeInvitationAction,
}));

import { EmployeeAcceptance } from "./employee-acceptance";

const INVITATION_ID = "83000000-0000-4000-8000-000000000101";

function renderAcceptance(
  role: "owner" | "staff" = "staff",
  { cleanerMembershipActive = false } = {},
) {
  return render(
    <EmployeeAcceptance
      accountExisted={false}
      cleanerMembershipActive={cleanerMembershipActive}
      companyName="Coastal Demo Cleaning"
      defaultLocale="en-AU"
      invitationId={INVITATION_ID}
      inviteeEmail="invitee@example.test"
      role={role}
    />,
  );
}

// CLE-99. The action has always collected a language error and the form never drew it, so a
// posted language the app does not ship came back as a form that simply did nothing.
describe("EmployeeAcceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the language error at the language field", async () => {
    mocks.acceptEmployeeInvitationAction.mockResolvedValue({
      fieldErrors: { locale: "user.supportedLanguageRequired" },
      formError: null,
      ok: false,
    });
    const user = userEvent.setup();
    renderAcceptance();

    await user.type(screen.getByLabelText("Full name"), "New Employee");
    await user.type(screen.getByLabelText("Password"), "safe-local-password");
    await user.type(screen.getByLabelText("Confirm password"), "safe-local-password");
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));

    expect(await screen.findByText("Choose a supported language.")).toBeInTheDocument();
    const language = screen.getByRole("combobox", { name: "Language" });
    expect(language).toHaveAttribute("aria-invalid", "true");
    expect(language).toHaveAttribute("aria-describedby", "employee-locale-error");
  });

  it("leaves the language field unmarked when the language was accepted", async () => {
    mocks.acceptEmployeeInvitationAction.mockResolvedValue({
      fieldErrors: { password: "user.employeePasswordLength" },
      formError: null,
      ok: false,
    });
    const user = userEvent.setup();
    renderAcceptance();

    await user.type(screen.getByLabelText("Full name"), "New Employee");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.type(screen.getByLabelText("Confirm password"), "short");
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));

    expect(await screen.findByText("Use a password between 8 and 72 characters."))
      .toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" }))
      .not.toHaveAttribute("aria-invalid", "true");
  });
});

// CLE-101. The invitee was shown a role name and nothing else, so accepting meant agreeing to
// an access level they could not read. The line is the same one the inviter chose it by.
describe("CLE-101 the offered role is explained before it is accepted", () => {
  it("says what a staff invitation can do", () => {
    renderAcceptance("staff");

    expect(screen.getByText(
      "Staff can manage their own settings and run day-to-day work, but cannot edit company "
      + "details or manage employees.",
    )).toBeInTheDocument();
    // The role name keeps an element of its own, so it still reads — and still matches — on
    // its own rather than running into the sentence beside it.
    expect(screen.getByText("Staff", { exact: true })).toBeInTheDocument();
  });

  it("says what an owner invitation can do", () => {
    renderAcceptance("owner");

    expect(screen.getByText(
      "Owners can edit company details, invite and manage employees, and run day-to-day work.",
    )).toBeInTheDocument();
  });

  it("says what the offered role can do in Portuguese", () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";

    renderAcceptance("owner");

    expect(screen.getByText(
      "Proprietários podem editar os dados da empresa, convidar e gerenciar funcionários e "
      + "cuidar do trabalho diário.",
    )).toBeInTheDocument();

    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });
});

// CLE-102. The same person can clean for a company and be invited onto its office side under
// one sign-in address. Read as a generic join, the screen implies a second account.
describe("CLE-102 an invitee the company already works with", () => {
  afterEach(() => {
    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });

  it("names the role being added to the account they already clean with", () => {
    renderAcceptance("staff", { cleanerMembershipActive: true });

    expect(screen.getByText(
      "You already clean for Coastal Demo Cleaning. Accepting adds the Staff role to this "
      + "same account, and your cleaning work does not change.",
    )).toBeInTheDocument();
  });

  it("names an owner invitation by the role it actually grants", () => {
    renderAcceptance("owner", { cleanerMembershipActive: true });

    expect(screen.getByText(
      "You already clean for Coastal Demo Cleaning. Accepting adds the Owner role to this "
      + "same account, and your cleaning work does not change.",
    )).toBeInTheDocument();
  });

  it("says it in Portuguese", () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";

    renderAcceptance("staff", { cleanerMembershipActive: true });

    expect(screen.getByText(
      "Você já faz limpezas para a Coastal Demo Cleaning. Aceitar adiciona a função "
      + "Funcionário a esta mesma conta, e seu trabalho de limpeza não muda.",
    )).toBeInTheDocument();
  });

  it("stays silent for an invitee who does not clean for the company", () => {
    renderAcceptance("staff");

    expect(screen.queryByText(/You already clean for/)).not.toBeInTheDocument();
  });
});
