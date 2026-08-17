"use server";

import { isAppLocale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

export type LocalePreferenceResult = { ok: true } | { ok: false };

export async function setPreferredLocaleAction(
  requestedLocale: string,
): Promise<LocalePreferenceResult> {
  if (!isAppLocale(requestedLocale)) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_preferred_locale", {
    target_locale: requestedLocale,
  });

  return error ? { ok: false } : { ok: true };
}
