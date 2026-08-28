"use server";

import { cookies } from "next/headers";

import {
  decodePendingConfirmation,
  pendingConfirmationCookieName,
} from "@/lib/auth/pending-confirmation";
import { createClient } from "@/lib/supabase/server";

export type PendingConfirmationResult = { ok: boolean };

/**
 * Spends the token `/auth/confirm` parked. This is the only step in the flow a person takes,
 * which is the point: the exchange is a POST behind a same-origin server action, so the
 * scanners and prefetches that follow the link cannot reach it.
 *
 * Callable without a session — the invitee has no account until this succeeds. Authority comes
 * from holding the parked token, which only this browser's own visit to the link can have set,
 * and which Auth validates on exchange.
 */
export async function continuePendingConfirmationAction(): Promise<PendingConfirmationResult> {
  const cookieStore = await cookies();
  const pending = decodePendingConfirmation(
    cookieStore.get(pendingConfirmationCookieName)?.value,
  );
  if (!pending) return { ok: false };

  // Cleared before the exchange, not after: a token survives exactly one attempt, so keeping
  // it would leave a spent credential in the browser and let a reload retry what cannot work.
  cookieStore.delete(pendingConfirmationCookieName);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: pending.tokenHash,
    type: pending.type,
  });

  if (error) {
    // The reason stays in the log. The page says only that the link no longer works and offers
    // a new one, because naming the reason would tell whoever holds a link which are live.
    console.error("A parked invitation confirmation could not be exchanged", { reason: error });
    return { ok: false };
  }

  return { ok: true };
}
