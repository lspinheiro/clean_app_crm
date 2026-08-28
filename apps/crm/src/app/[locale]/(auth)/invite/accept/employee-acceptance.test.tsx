import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptEmployeeInvitationAction: vi.fn(),
}));

vi.mock("@/app/actions/employee-invitations", () => ({
  acceptEmployeeInvitationAction: mocks.acceptEmployeeInvitationAction,
}));

import { EmployeeAcceptance } from "./employee-acceptance";

const INVITATION_ID = "83000000-0000-4000-8000-000000000101";

function renderAcceptance() {
  return render(
    <EmployeeAcceptance
      accountExisted={false}
      companyName="Coastal Demo Cleaning"
      defaultLocale="en-AU"
      invitationId={INVITATION_ID}
      inviteeEmail="invitee@example.test"
      role="staff"
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
