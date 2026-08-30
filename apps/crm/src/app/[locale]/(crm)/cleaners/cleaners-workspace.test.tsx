import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revokePosting: vi.fn(),
  retryFailedCleanerInviteEmails: vi.fn(),
  sendCleanerInviteEmails: vi.fn(),
}));

vi.mock("@/app/actions/postings", () => ({
  revokePosting: mocks.revokePosting,
}));
vi.mock("@/app/actions/cleaner-email", () => ({
  retryFailedCleanerInviteEmails: mocks.retryFailedCleanerInviteEmails,
  sendCleanerInviteEmails: mocks.sendCleanerInviteEmails,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CleanersWorkspace } from "./cleaners-workspace";

const baseProps = {
  cleanerAppUrl: "https://cleaner.example.test",
  companyName: "Coastal Demo Cleaning",
  members: [],
  postings: [
    {
      applicationCount: 3,
      closingReason: null,
      code: "AB12CD34EF56GH78",
      createdAt: "2026-08-30T01:00:00Z",
      id: "59000000-0000-4000-8000-000000000501",
      intent: "one_time" as const,
      publicDescription: "Cover one hotel clean.",
      state: "active" as const,
    },
    {
      applicationCount: 8,
      closingReason: "cap_reached" as const,
      code: "ZX98YU76TS54RQ32",
      createdAt: "2026-08-29T01:00:00Z",
      id: "59000000-0000-4000-8000-000000000502",
      intent: "regular" as const,
      publicDescription: "Join a regular hotel roster.",
      state: "closed" as const,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

afterEach(() => {
  delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
});

describe("CLE-60 posting workspace", () => {
  it("lists posting intent, lifecycle, closing reason, and application count", () => {
    render(<CleanersWorkspace {...baseProps} />);

    const activePosting = screen.getByRole("listitem", { name: "Cover one hotel clean." });
    expect(activePosting).toHaveTextContent("One-time opportunity");
    expect(activePosting).toHaveTextContent("Active");
    expect(activePosting).toHaveTextContent("3 applications");

    const closedPosting = screen.getByRole("listitem", { name: "Join a regular hotel roster." });
    expect(closedPosting).toHaveTextContent("Regular opportunity");
    expect(closedPosting).toHaveTextContent("Closed · Application cap reached");
    expect(closedPosting).toHaveTextContent("8 applications");
  });

  it("revokes an active posting from the list and exposes no regenerate action", async () => {
    mocks.revokePosting.mockResolvedValueOnce({ ok: true });
    render(<CleanersWorkspace {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke Cover one hotel clean." }));

    await waitFor(() => expect(mocks.revokePosting).toHaveBeenCalledWith(
      "59000000-0000-4000-8000-000000000501",
    ));
    expect(screen.queryByRole("button", { name: /regenerate|replace/i })).not.toBeInTheDocument();
  });

  it("starts intent-first creation in the shared composer", () => {
    render(<CleanersWorkspace {...baseProps} />);

    expect(screen.getByRole("link", { name: "Create posting" })).toHaveAttribute(
      "href",
      "/cleaners/postings/new",
    );
  });

  it("opens the S30 send list only for the selected active posting", () => {
    render(<CleanersWorkspace {...baseProps} />);

    expect(screen.getByRole("button", {
      name: "Send Cover one hotel clean. by email",
    })).toBeEnabled();
    expect(screen.queryByRole("button", {
      name: "Send Join a regular hotel roster. by email",
    })).not.toBeInTheDocument();
  });

  it.each([
    {
      expectedMessage: "Coastal Demo Cleaning has shared: Expression of interest — https://cleaner.example.test/join?code=AB12CD34EF56GH78",
      intent: "expression_of_interest" as const,
      locale: "en-AU",
    },
    {
      expectedMessage: "Coastal Demo Cleaning has shared: One-time opportunity — https://cleaner.example.test/join?code=AB12CD34EF56GH78",
      intent: "one_time" as const,
      locale: "en-AU",
    },
    {
      expectedMessage: "Coastal Demo Cleaning has shared: Regular opportunity — https://cleaner.example.test/join?code=AB12CD34EF56GH78",
      intent: "regular" as const,
      locale: "en-AU",
    },
    {
      expectedMessage: "Coastal Demo Cleaning compartilhou: Manifestação de interesse — https://cleaner.example.test/join?code=AB12CD34EF56GH78",
      intent: "expression_of_interest" as const,
      locale: "pt-BR",
    },
    {
      expectedMessage: "Coastal Demo Cleaning compartilhou: Oportunidade avulsa — https://cleaner.example.test/join?code=AB12CD34EF56GH78",
      intent: "one_time" as const,
      locale: "pt-BR",
    },
    {
      expectedMessage: "Coastal Demo Cleaning compartilhou: Oportunidade regular — https://cleaner.example.test/join?code=AB12CD34EF56GH78",
      intent: "regular" as const,
      locale: "pt-BR",
    },
  ])("opens grammatical $locale WhatsApp copy for $intent", ({
    expectedMessage,
    intent,
    locale,
  }) => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = locale;
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <CleanersWorkspace
        {...baseProps}
        postings={[{ ...baseProps.postings[0], intent }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: locale === "en-AU"
        ? "Share Cover one hotel clean. on WhatsApp"
        : "Compartilhar Cover one hotel clean. no WhatsApp",
    }));

    expect(open).toHaveBeenCalledWith(
      `https://wa.me/?text=${encodeURIComponent(expectedMessage)}`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("copies the selected posting link and confirms the action", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<CleanersWorkspace {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy link for Cover one hotel clean." }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      "https://cleaner.example.test/join?code=AB12CD34EF56GH78",
    ));
    expect(screen.getByRole("status")).toHaveTextContent("Posting link copied.");
  });

  it("resets the e-mail flow when the admin closes one posting and selects another", async () => {
    mocks.sendCleanerInviteEmails.mockResolvedValueOnce({
      accepted: [],
      batchId: "10000000-0000-4000-8000-000000000401",
      failed: [{ email: "ana@example.com", failureReason: "provider_rejected", name: null }],
      ok: true,
    });
    const user = userEvent.setup();
    const secondPosting = {
      ...baseProps.postings[1],
      closingReason: null,
      state: "active" as const,
    };
    render(<CleanersWorkspace {...baseProps} postings={[baseProps.postings[0], secondPosting]} />);

    await user.click(screen.getByRole("button", { name: "Send Cover one hotel clean. by email" }));
    await user.click(screen.getByRole("button", { name: "Send by email" }));
    await user.type(screen.getByLabelText("Email address 1"), "ana@example.com");
    await user.click(screen.getByRole("checkbox", {
      name: "I confirm that these recipients are existing workers who expect this posting.",
    }));
    await user.click(screen.getByRole("button", { name: "Send posting to 1 recipient" }));
    expect(await screen.findByRole("button", { name: "Retry failed only" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send Cover one hotel clean. by email" }));
    await user.click(screen.getByRole("button", {
      name: "Send Join a regular hotel roster. by email",
    }));
    expect(screen.queryByRole("region", { name: "Posting email results" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send by email" }));
    expect(screen.getByLabelText("Email address 1")).toHaveValue("");
    await user.type(screen.getByLabelText("Email address 1"), "bruno@example.com");
    expect(screen.getByRole("checkbox", {
      name: "I confirm that these recipients are existing workers who expect this posting.",
    })).not.toBeChecked();
  });
});
