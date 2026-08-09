import { createServerClient } from "@supabase/ssr";
import type { Database } from "@clean-app/db";
import { cookies } from "next/headers";

import { getSupabaseBrowserEnv } from "./env";

export async function createClient() {
  const cookieStore = await cookies();
  const { publishableKey, url } = getSupabaseBrowserEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          if (error instanceof Error && error.message.includes("Server Component")) return;
          throw error;
        }
      },
    },
  });
}
