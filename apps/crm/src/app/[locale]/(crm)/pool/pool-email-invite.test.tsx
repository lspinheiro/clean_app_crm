import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retryFailedPoolInviteEmails: vi.fn(),
  sendPoolInviteEmails: vi.fn(),
}));

vi.mock("@/app/actions/pool-email", () => ({
  retryFailedPoolInviteEmails: mocks.retryFailedPoolInviteEmails,
  sendPoolInviteEmails: mocks.sendPoolInviteEmails,
}));

import { PoolEmailInvite } from "./pool-email-invite";

const props = {
  companyName: "Coastal Demo Cleaning",
  inviteId: "10000000-0000-4000-8000-000000000201",
  joinUrl: "https://cleaner.example.test/join?code=AB12CD",
};
const retryKey = "10000000-0000-4000-8000-000000000302";

async function openAndUpload(csv: string) {
  const user = userEvent.setup();
  render(<PoolEmailInvite {...props} />);
  await user.click(screen.getByRole("button", { name: "Invite by email" }));
  await user.upload(
    screen.getByLabelText("Cleaner email CSV file"),
    new File([csv], "cleaners.csv", { type: "text/csv" }),
  );
  return user;
}

describe("CLE-79 pool email invitation UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.retryFailedPoolInviteEmails.mockReset();
    mocks.sendPoolInviteEmails.mockReset();
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
    expect(screen.getByText("Join Coastal Demo Cleaning's cleaner pool")).toBeInTheDocument();
    const sendButton = screen.getByRole("button", { name: "Send 2 invitations" });
    expect(sendButton).toBeDisabled();
    expect(mocks.sendPoolInviteEmails).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Invitation language"), "pt-BR");
    expect(
      screen.getByText(
        "Entre para o banco de profissionais da empresa Coastal Demo Cleaning",
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
    mocks.sendPoolInviteEmails.mockResolvedValueOnce({
      accepted: [
        { email: "ana@example.com", failureReason: null, name: null },
        { email: "bruno@example.com", failureReason: null, name: null },
      ],
      batchId: "10000000-0000-4000-8000-000000000402",
      failed: [],
      ok: true,
    });
    const user = userEvent.setup();
    render(<PoolEmailInvite {...props} />);

    await user.click(screen.getByRole("button", { name: "Invite by email" }));

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
      expect(mocks.sendPoolInviteEmails).toHaveBeenCalledWith({
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
    render(<PoolEmailInvite {...props} />);
    await user.click(screen.getByRole("button", { name: "Invite by email" }));

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
    expect(mocks.sendPoolInviteEmails).not.toHaveBeenCalled();
  });

  it("renders the manual recipient form in Portuguese", async () => {
    (globalThis as { __CRM_TEST_LOCALE__?: string }).__CRM_TEST_LOCALE__ = "pt-BR";
    const user = userEvent.setup();
    render(<PoolEmailInvite {...props} />);

    await user.click(screen.getByRole("button", { name: "Convidar por e-mail" }));

    const form = screen.getByRole("form", { name: "Destinatários dos convites" });
    expect(within(form).getByLabelText("Endereço de e-mail 1")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Adicionar outro e-mail" })).toBeEnabled();
    expect(within(form).getByRole("button", { name: "Enviar convites" })).toBeDisabled();
  });

  it("shows partial outcomes and retries only the failed batch recipients", async () => {
    mocks.sendPoolInviteEmails.mockResolvedValueOnce({
      accepted: [{ email: "ana@example.com", failureReason: null, name: "Ana" }],
      batchId: "10000000-0000-4000-8000-000000000401",
      failed: [{ email: "bruno@example.com", failureReason: "provider_rejected", name: "Bruno" }],
      ok: true,
    });
    mocks.retryFailedPoolInviteEmails.mockResolvedValueOnce({
      accepted: [
        { email: "ana@example.com", failureReason: null, name: "Ana" },
        { email: "bruno@example.com", failureReason: null, name: "Bruno" },
      ],
      batchId: "10000000-0000-4000-8000-000000000401",
      failed: [],
      ok: true,
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
    expect(within(results).getByText("1 accepted")).toBeInTheDocument();
    expect(within(results).getByText("1 failed")).toBeInTheDocument();
    expect(within(results).getByText("bruno@example.com")).toBeInTheDocument();
    expect(mocks.sendPoolInviteEmails).toHaveBeenCalledWith({
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
      expect(mocks.retryFailedPoolInviteEmails).toHaveBeenCalledWith({
        batchId: "10000000-0000-4000-8000-000000000401",
        retryKey,
      });
    });
    expect(await screen.findByText("2 accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry failed only" })).not.toBeInTheDocument();
  });
});
