import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rotateCleanerInvite: vi.fn(),
}));

vi.mock("@/app/actions/cleaners", () => ({
  rotateCleanerInvite: mocks.rotateCleanerInvite,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CleanersWorkspace } from "./cleaners-workspace";

const baseProps = {
  cleanerAppUrl: "https://cleaner.example.test",
  companyName: "Coastal Demo Cleaning",
  initialInviteId: "10000000-0000-4000-8000-000000000201",
  members: [],
};

beforeEach(() => {
  mocks.rotateCleanerInvite.mockReset();
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

describe("Cleaner staff invitation workspace", () => {
  it("keeps WhatsApp sharing unavailable without an active invite", () => {
    render(<CleanersWorkspace {...baseProps} initialCode={null} />);

    expect(
      screen.getByRole("button", { name: "Share on WhatsApp" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create invitation" })).toBeEnabled();
  });

  it.each([
    {
      expectedMessage:
        "Join Coastal Demo Cleaning's Cleaner staff: https://cleaner.example.test/join?code=AB12CD34EF56GH78\nInvite code: AB12CD34EF56GH78",
      label: "Share on WhatsApp",
      locale: "en-AU",
    },
    {
      expectedMessage:
        "Entre para a equipe de limpeza da empresa Coastal Demo Cleaning: https://cleaner.example.test/join?code=AB12CD34EF56GH78\nCódigo de convite: AB12CD34EF56GH78",
      label: "Compartilhar no WhatsApp",
      locale: "pt-BR",
    },
  ])("opens the localized $locale message from an explicit click", ({
    expectedMessage,
    label,
    locale,
  }) => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = locale;
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<CleanersWorkspace {...baseProps} initialCode="AB12CD34EF56GH78" />);

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(openWindow).toHaveBeenCalledOnce();
    const [rawUrl, target, features] = openWindow.mock.calls[0];
    expect(rawUrl).toBe(
      `https://wa.me/?text=${encodeURIComponent(expectedMessage)}`,
    );
    expect(target).toBe("_blank");
    expect(features).toBe("noopener,noreferrer");
  });

  it("protects replacement behind invite details and a confirmation dialog", async () => {
    mocks.rotateCleanerInvite.mockResolvedValueOnce({
      code: "ZX98YU76TS54RQ32",
      inviteId: "10000000-0000-4000-8000-000000000202",
      ok: true,
    });
    render(<CleanersWorkspace {...baseProps} initialCode="AB12CD34EF56GH78" />);

    expect(screen.getByText("Invitation active")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replace invitation" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Invite details" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace invitation" }));

    expect(mocks.rotateCleanerInvite).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Replace the active invitation?" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    await waitFor(() => expect(mocks.rotateCleanerInvite).toHaveBeenCalledOnce());
    expect((await screen.findAllByText("ZX98YU76TS54RQ32")).length).toBeGreaterThan(0);
  });

  it("keeps the open invite details showing the code the refreshed page reports", () => {
    const { rerender } = render(
      <CleanersWorkspace {...baseProps} initialCode="AB12CD34EF56GH78" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Invite details" }));
    expect(screen.getByRole("link", { name: "Cleaner signup link" })).toHaveAttribute(
      "href",
      "https://cleaner.example.test/join?code=AB12CD34EF56GH78",
    );

    // A rotation ends in router.refresh(), so the server re-renders this workspace with
    // the replacement invite. The admin rotated the code in order to hand it out, so the
    // details must stay open and must show the code the server now reports.
    rerender(
      <CleanersWorkspace
        {...baseProps}
        initialCode="ZX98YU76TS54RQ32"
        initialInviteId="10000000-0000-4000-8000-000000000202"
      />,
    );

    expect(screen.getByRole("link", { name: "Cleaner signup link" })).toHaveAttribute(
      "href",
      "https://cleaner.example.test/join?code=ZX98YU76TS54RQ32",
    );
  });
});

describe("CLE-79 bulk cleaner invitation by email", () => {
  it("offers manual and CSV email invitation inputs when an active invite exists", () => {
    render(<CleanersWorkspace {...baseProps} initialCode="AB12CD34EF56GH78" />);

    expect(
      screen.getByRole("button", { name: "Send by email" }),
    ).toBeEnabled();
    expect(
      screen.getByText("Send the same active invitation to one or more existing cleaners."),
    ).toBeInTheDocument();
  });

  it("keeps email invitation unavailable without an active invite", () => {
    render(<CleanersWorkspace {...baseProps} initialCode={null} />);

    expect(
      screen.getByRole("button", { name: "Send by email" }),
    ).toBeDisabled();
  });
});
