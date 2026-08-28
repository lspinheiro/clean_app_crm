import { z } from "zod";

/**
 * A Supabase auth token that has arrived but has not been spent.
 *
 * The link in an invitation e-mail is fetched by things that are not the invitee — Outlook and
 * Mimecast scanners, corporate mail gateways, browser prefetches, a reload, the invitee
 * forwarding the message to themselves. While `/auth/confirm` exchanged the token on the GET,
 * every one of those spent it, and confirmed the account on the invitee's behalf into the
 * bargain. The route now parks the token here and a person spends it by pressing Continue.
 */
export const pendingConfirmationCookieName = "crm_pending_confirmation";

/**
 * Long enough to read a screen and press a button, short enough that a token does not sit in a
 * shared browser. Lapsing is not a dead end: the link in the inbox no longer spends anything,
 * so opening it again re-parks a token for as long as the invitation itself lives.
 */
export const pendingConfirmationMaxAgeSeconds = 30 * 60;

const pendingConfirmationSchema = z.object({
  // Supabase hashes are short; the bound is only to stop an oversized cookie being parsed.
  tokenHash: z.string().min(1).max(512),
  // The two the product issues. `invite` sets up a new account, `recovery` renews a link for
  // an address that has already been confirmed.
  type: z.enum(["invite", "recovery"]),
});

export type PendingConfirmation = z.infer<typeof pendingConfirmationSchema>;

export function encodePendingConfirmation(value: PendingConfirmation) {
  return `${value.type}:${value.tokenHash}`;
}

/** Splits on the first colon only, so a hash containing one survives. */
export function decodePendingConfirmation(
  value: string | undefined,
): PendingConfirmation | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator < 0) return null;

  const parsed = pendingConfirmationSchema.safeParse({
    tokenHash: value.slice(separator + 1),
    type: value.slice(0, separator),
  });
  return parsed.success ? parsed.data : null;
}
