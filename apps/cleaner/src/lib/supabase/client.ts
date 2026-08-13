import type { Database } from "@clean-app/db";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserEnv } from "./env";

let client: SupabaseClient<Database> | null = null;

/**
 * The single Supabase client for the app. PKCE with a locally persisted session, not the
 * SSR cookie pattern — ADR 0004 keeps this app packageable into a Capacitor shell, and the
 * auth flow is the fork that is painful to reverse later.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const { publishableKey, url } = getSupabaseBrowserEnv();
  client = createClient<Database>(url, publishableKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}
