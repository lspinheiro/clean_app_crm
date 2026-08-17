import { describe, expect, it, vi } from "vitest";

import { parseInvitationCommand, sendFirstAdminInvitation } from "./invite-first-admin.mjs";

function validEnvironment() {
  return {
    CRM_PUBLIC_URL: "https://crm.example.test/",
    FIRST_ADMIN_INVITER: "founder@example.test",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: "test-secret-key",
  };
}

describe("first-admin invitation command", () => {
  it("normalises one e-mail and accepts only the two application locales", () => {
    expect(
      parseInvitationCommand(
        ["--email", " First.Admin@Example.Test ", "--locale", "pt-BR"],
        validEnvironment(),
      ),
    ).toMatchObject({
      email: "first.admin@example.test",
      locale: "pt-BR",
      operator: "founder@example.test",
      publicUrl: "https://crm.example.test",
    });

    expect(() =>
      parseInvitationCommand(
        ["--email", "admin@example.test", "--locale", "fr-FR"],
        validEnvironment(),
      ),
    ).toThrow("Locale must be en-AU or pt-BR.");
  });

  it("requires the trusted secret, operator identity, and CRM URL", () => {
    expect(() =>
      parseInvitationCommand(
        ["--email", "admin@example.test", "--locale", "en-AU"],
        {},
      ),
    ).toThrow("First-admin invitation configuration is incomplete.");
  });

  it("prepares state before asking Supabase Auth to send one locale-aware invite", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          created: true,
          invitation_expires_at: "2026-08-18T02:00:00.000Z",
          invitation_id: "invite-1",
        },
      ],
      error: null,
    });
    const inviteUserByEmail = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const client = { auth: { admin: { inviteUserByEmail } }, rpc };

    await expect(
      sendFirstAdminInvitation({
        client,
        command: parseInvitationCommand(
          ["--email", "admin@example.test", "--locale", "en-AU"],
          validEnvironment(),
        ),
        now: new Date("2026-08-18T01:00:00.000Z"),
      }),
    ).resolves.toEqual({
      email: "admin@example.test",
      expiresAt: "2026-08-18T02:00:00.000Z",
      kind: "sent",
      locale: "en-AU",
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "prepare_first_admin_invitation", {
      expires_at: "2026-08-18T02:00:00.000Z",
      invited_by: "founder@example.test",
      target_email: "admin@example.test",
      target_locale: "en-AU",
    });
    expect(inviteUserByEmail).toHaveBeenCalledWith("admin@example.test", {
      data: { preferred_locale: "en-AU" },
      redirectTo: "https://crm.example.test/en-AU/auth/confirm",
    });
  });

  it("reports an existing pending invite and never asks Auth to send again", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          created: false,
          invitation_expires_at: "2026-08-18T02:00:00.000Z",
          invitation_id: "invite-1",
        },
      ],
      error: null,
    });
    const inviteUserByEmail = vi.fn();

    await expect(
      sendFirstAdminInvitation({
        client: { auth: { admin: { inviteUserByEmail } }, rpc },
        command: parseInvitationCommand(
          ["--email", "admin@example.test", "--locale", "en-AU"],
          validEnvironment(),
        ),
        now: new Date("2026-08-18T01:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ kind: "already_pending" });

    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("revokes prepared application state when Auth rejects the send", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            created: true,
            invitation_expires_at: "2026-08-18T02:00:00.000Z",
            invitation_id: "invite-1",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "raw provider detail" },
    });

    await expect(
      sendFirstAdminInvitation({
        client: { auth: { admin: { inviteUserByEmail } }, rpc },
        command: parseInvitationCommand(
          ["--email", "admin@example.test", "--locale", "en-AU"],
          validEnvironment(),
        ),
        now: new Date("2026-08-18T01:00:00.000Z"),
      }),
    ).rejects.toThrow(
      "Supabase did not send the invitation. Check whether the e-mail already has an Auth account.",
    );

    expect(rpc).toHaveBeenNthCalledWith(2, "revoke_first_admin_invitation", {
      target_invitation_id: "invite-1",
    });
  });

  it("surfaces a cleanup failure so an operator knows the pending invite may need attention", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            created: true,
            invitation_expires_at: "2026-08-18T02:00:00.000Z",
            invitation_id: "invite-1",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "raw database detail" } });
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "raw provider detail" },
    });

    await expect(
      sendFirstAdminInvitation({
        client: { auth: { admin: { inviteUserByEmail } }, rpc },
        command: parseInvitationCommand(
          ["--email", "admin@example.test", "--locale", "en-AU"],
          validEnvironment(),
        ),
        now: new Date("2026-08-18T01:00:00.000Z"),
      }),
    ).rejects.toThrow(
      "Supabase did not send the invitation, and the application could not revoke its pending record.",
    );
  });
});
