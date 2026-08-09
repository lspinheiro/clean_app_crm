import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@clean-app/db";

import { getSupabaseBrowserEnv } from "./env";

export function createClient() {
  const { publishableKey, url } = getSupabaseBrowserEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
