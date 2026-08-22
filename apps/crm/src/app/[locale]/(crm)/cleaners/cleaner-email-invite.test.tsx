import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retryFailedCleanerInviteEmails: vi.fn(),
  sendCleanerInviteEmails: vi.fn(),
}));

vi.mock("@/app/actions/cleaner-email", () => ({
  retryFailedCleanerInviteEmails: mocks.retryFailedCleanerInviteEmails,
  sendCleanerInviteEmails: mocks.sendCleanerInviteEmails,
}));

import { CleanerEmailInvite } from "./cleaner-email-invite";

const props = {
  companyName: "Coastal Demo Cleaning",
  inviteId: "10000000-0000-4000-8000-000000000201",
  joinUrl: "https://cleaner.example.test/join?code=AB12CD34EF56GH78",
};
const retryKey = "10000000-0000-4000-8000-000000000302";

async function openAndUpload(csv: string) {
  const user = userEvent.setup();
  render(<CleanerEmailInvite {...props} />);
  await user.click(screen.getByRole("button", { name: "Send by email" }));
  await user.upload(
    screen.getByLabelText("Cleaner email CSV file"),
    new File([csv], "cleaners.csv", { type: "text/csv" }),
  );
  return user;
}

describe("CLE-79 cleaner email invitation UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.retryFailedCleanerInviteEmails.mockReset();
    mocks.sendCleanerInviteEmails.mockReset();
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce(retryKey);
  });

  afterEach(() => {
    delete (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__;
  });

  it("previews the unique recipients and exact localised message before confirmation", async () => {
    const user = await openAndUpload(
      "email,name\nana@example.com,Ana\nANA@example.com,Duplicate\nbruno@example.com,Bruno\n",
    );

    const table = await screen.findByRole("table", { name: "Cleaner email CSV preview" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(screen.getByText("2 unique recipients")).toBeInTheDocument();
    expect(screen.getByText("1 duplicate skipped")).toBeInTheDocument();
    expect(screen.getByText("Join Coastal Demo Cleaning's Cleaner staff")).toBeInTheDocument();
    const sendButton = screen.getByRole("button", { name: "Send 2 invitations" });
    expect(sendButton).toBeDisabled();
    expect(mocks.sendCleanerInviteEmails).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Invitation language"), "pt-BR");
    expect(
      screen.getByText(
        "Entre para a equipe de limpeza da empresa Coastal Demo Cleaning",
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", {
        name: "I confirm that these recipients are existing workers who expect this invitation.",
      }),
    );
    expect(sendButton).toBeEnabled();
  });

  it("sends multiple manually entered email addresses without requiring a CSV", async () => {
    mocks.sendCleanerInviteEmails.mockResolvedValueOnce({
      accepted: [
        { email: "ana@example.com", failureReason: null, name: null },
        { email: "bruno@example.com", failureReason: null, name: null },
      ],
      batchId: "10000000-0000-4000-8000-000000000402",
      failed: [],
      newlyQueued: 2,
      ok: true,
      reusedExisting: false,
    });
    const user = userEvent.setup();
    render(<CleanerEmailInvite {...props} />);

    await user.click(screen.getByRole("button", { name: "Send by email" }));

    const form = screen.getByRole("form", { name: "Email recipients" });
    expect(within(form).getByRole("button", { name: "Send invitations" })).toBeDisabled();
    await user.type(within(form).getByLabelText("Email address 1"), "ana@example.com");
    await user.click(within(form).getByRole("button", { name: "Add another email" }));
    await user.type(within(form).getByLabelText("Email address 2"), "bruno@example.com");
    await user.click(
      within(form).getByRole("checkbox", {
        name: "I confirm that these recipients are existing workers who expect this invitation.",
      }),
    );
    await user.click(within(form).getByRole("button", { name: "Send 2 invitations" }));

    await waitFor(() => {
      expect(mocks.sendCleanerInviteEmails).toHaveBeenCalledWith({
        authorityConfirmed: true,
        inviteId: props.inviteId,
        locale: "en-AU",
        recipients: [
          { email: "ana@example.com", name: null },
          { email: "bruno@example.com", name: null },
        ],
      });
    });
  });

  it("blocks invalid and duplicate manually entered addresses", async () => {
    const user = userEvent.setup();
    render(<CleanerEmailInvite {...props} />);
    await user.click(screen.getByRole("button", { name: "Send by email" }));

    const form = screen.getByRole("form", { name: "Email recipients" });
    const firstAddress = within(form).getByLabelText("Email address 1");
    await user.type(firstAddress, "not-an-email");
    expect(within(form).getByText("Enter a valid email address.")).toBeInTheDocument();

    await user.clear(firstAddress);
    await user.type(firstAddress, "ana@example.com");
    await user.click(within(form).getByRole("button", { name: "Add another email" }));
    await user.type(within(form).getByLabelText("Email address 2"), "ANA@example.com");
    expect(
      within(form).getByText("This email address has already been added."),
    ).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Send 1 invitation" })).toBeDisabled();
    expect(mocks.sendCleanerInviteEmails).not.toHaveBeenCalled();
  });

  it("renders the manual recipient form in Portuguese", async () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";
    const user = userEvent.setup();
    render(<CleanerEmailInvite {...props} />);

    await user.click(screen.getByRole("button", { name: "Enviar por e-mail" }));

    const form = screen.getByRole("form", { name: "Destinatários dos convites" });
    expect(within(form).getByLabelText("Endereço de e-mail 1")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Adicionar outro e-mail" })).toBeEnabled();
    expect(within(form).getByRole("button", { name: "Enviar convites" })).toBeDisabled();
  });

  it("shows partial outcomes and retries only the failed batch recipients", async () => {
    mocks.sendCleanerInviteEmails.mockResolvedValueOnce({
      accepted: [{ email: "ana@example.com", failureReason: null, name: "Ana" }],
      batchId: "10000000-0000-4000-8000-000000000401",
      failed: [{ email: "bruno@example.com", failureReason: "provider_rejected", name: "Bruno" }],
      newlyQueued: 1,
      ok: true,
      reusedExisting: false,
    });
    mocks.retryFailedCleanerInviteEmails.mockResolvedValueOnce({
      accepted: [
        { email: "ana@example.com", failureReason: null, name: "Ana" },
        { email: "bruno@example.com", failureReason: null, name: "Bruno" },
      ],
      batchId: "10000000-0000-4000-8000-000000000401",
      failed: [],
      newlyQueued: 1,
      ok: true,
      reusedExisting: false,
    });
    const user = await openAndUpload(
      "email,name\nana@example.com,Ana\nbruno@example.com,Bruno\n",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "I confirm that these recipients are existing workers who expect this invitation.",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Send 2 invitations" }));

    const results = await screen.findByRole("region", { name: "Email invitation results" });
    expect(within(results).getByText("1 queued now")).toBeInTheDocument();
    expect(within(results).getByText("1 failed")).toBeInTheDocument();
    expect(within(results).getByText("bruno@example.com")).toBeInTheDocument();
    expect(mocks.sendCleanerInviteEmails).toHaveBeenCalledWith({
      authorityConfirmed: true,
      inviteId: props.inviteId,
      locale: "en-AU",
      recipients: [
        { email: "ana@example.com", name: "Ana" },
        { email: "bruno@example.com", name: "Bruno" },
      ],
    });

    await user.click(within(results).getByRole("button", { name: "Retry failed only" }));
    await waitFor(() => {
      expect(mocks.retryFailedCleanerInviteEmails).toHaveBeenCalledWith({
        batchId: "10000000-0000-4000-8000-000000000401",
        retryKey,
      });
    });
    expect(await screen.findByText("1 previously queued")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry failed only" })).not.toBeInTheDocument();
  });

  it("makes an idempotent repeat explicit when no new email is sent", async () => {
    mocks.sendCleanerInviteEmails.mockResolvedValueOnce({
      accepted: [{ email: "ana@example.com", failureReason: null, name: "Ana" }],
      batchId: "10000000-0000-4000-8000-000000000401",
      failed: [],
      newlyQueued: 0,
      ok: true,
      reusedExisting: true,
    });
    const user = userEvent.setup();
    render(<CleanerEmailInvite {...props} />);

    await user.click(screen.getByRole("button", { name: "Send by email" }));
    await user.type(screen.getByLabelText("Email address 1"), "ana@example.com");
    await user.click(
      screen.getByRole("checkbox", {
        name: "I confirm that these recipients are existing workers who expect this invitation.",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Send 1 invitation" }));

    const results = await screen.findByRole("region", { name: "Email invitation results" });
    expect(within(results).getByText("No new email was sent.")).toBeInTheDocument();
    expect(within(results).getByText("1 previously queued")).toBeInTheDocument();
  });

  it("clears delivery results when the active invitation is replaced", async () => {
    mocks.sendCleanerInviteEmails.mockResolvedValueOnce({
      accepted: [],
      batchId: "10000000-0000-4000-8000-000000000401",
      failed: [{ email: "ana@example.com", failureReason: "provider_rejected", name: null }],
      newlyQueued: 0,
      ok: true,
      reusedExisting: false,
    });
    const user = userEvent.setup();
    const { rerender } = render(<CleanerEmailInvite {...props} key={props.inviteId} />);

    await user.click(screen.getByRole("button", { name: "Send by email" }));
    await user.type(screen.getByLabelText("Email address 1"), "ana@example.com");
    await user.click(
      screen.getByRole("checkbox", {
        name: "I confirm that these recipients are existing workers who expect this invitation.",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Send 1 invitation" }));
    expect(
      await screen.findByRole("button", { name: "Retry failed only" }),
    ).toBeInTheDocument();

    rerender(
      <CleanerEmailInvite
        {...props}
        inviteId="10000000-0000-4000-8000-000000000202"
        joinUrl="https://cleaner.example.test/join?code=ZX98YU76TS54RQ32"
        key="10000000-0000-4000-8000-000000000202"
      />,
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: "Email invitation results" }),
      ).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Send by email" }));
    expect(screen.getByLabelText("Email address 1")).toHaveValue("");
    await user.type(screen.getByLabelText("Email address 1"), "ana@example.com");
    expect(
      screen.getByRole("checkbox", {
        name: "I confirm that these recipients are existing workers who expect this invitation.",
      }),
    ).not.toBeChecked();
  });
});
