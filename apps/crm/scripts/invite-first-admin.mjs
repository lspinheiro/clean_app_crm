import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

const invitationLifetimeMs = 60 * 60 * 1000;
const supportedLocales = new Set(["en-AU", "pt-BR"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readFlag(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith("--")) return null;
  return argv[index + 1];
}

function normalisePublicUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function parseInvitationCommand(argv, environment = process.env) {
  const email = readFlag(argv, "--email")?.trim().toLowerCase() ?? "";
  const locale = readFlag(argv, "--locale") ?? "";

  if (!emailPattern.test(email) || email.length > 320) {
    throw new Error("Enter a valid e-mail with --email.");
  }
  if (!supportedLocales.has(locale)) {
    throw new Error("Locale must be en-AU or pt-BR.");
  }

  const publicUrl = normalisePublicUrl(environment.CRM_PUBLIC_URL ?? "");
  const operator = environment.FIRST_ADMIN_INVITER?.trim();
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseSecret = (
    environment.SUPABASE_SECRET_KEY
    ?? environment.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();

  if (!publicUrl || !operator || !supabaseUrl || !supabaseSecret) {
    throw new Error("First-admin invitation configuration is incomplete.");
  }

  return {
    email,
    locale,
    operator,
    publicUrl,
    supabaseSecret,
    supabaseUrl,
  };
}

function firstPreparedRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export async function sendFirstAdminInvitation({ client, command, now = new Date() }) {
  const requestedExpiry = new Date(now.getTime() + invitationLifetimeMs).toISOString();
  const { data, error } = await client.rpc("prepare_first_admin_invitation", {
    expires_at: requestedExpiry,
    invited_by: command.operator,
    target_email: command.email,
    target_locale: command.locale,
  });
  const prepared = firstPreparedRow(data);

  if (error || !prepared?.invitation_id || !prepared.invitation_expires_at) {
    throw new Error("The application could not prepare the first-admin invitation.");
  }

  if (!prepared.created) {
    return {
      email: command.email,
      expiresAt: prepared.invitation_expires_at,
      kind: "already_pending",
      locale: command.locale,
    };
  }

  const { data: inviteData, error: inviteError } = await client.auth.admin.inviteUserByEmail(
    command.email,
    {
      data: { preferred_locale: command.locale },
      redirectTo: `${command.publicUrl}/${command.locale}/auth/confirm`,
    },
  );

  if (inviteError || !inviteData.user) {
    const { error: revokeError } = await client.rpc("revoke_first_admin_invitation", {
      target_invitation_id: prepared.invitation_id,
    });
    if (revokeError) {
      throw new Error(
        "Supabase did not send the invitation, and the application could not revoke its pending record.",
      );
    }
    throw new Error(
      "Supabase did not send the invitation. Check whether the e-mail already has an Auth account.",
    );
  }

  return {
    email: command.email,
    expiresAt: prepared.invitation_expires_at,
    kind: "sent",
    locale: command.locale,
  };
}

async function main() {
  const command = parseInvitationCommand(process.argv.slice(2));
  const client = createClient(command.supabaseUrl, command.supabaseSecret, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const result = await sendFirstAdminInvitation({ client, command });

  if (result.kind === "already_pending") {
    console.log(
      `A pending invitation already exists for ${result.email}. No e-mail was sent.`,
    );
    return;
  }

  console.log(
    `Invitation sent to ${result.email} in ${result.locale}. It expires at ${result.expiresAt}.`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "The invitation command failed.");
    process.exitCode = 1;
  });
}
