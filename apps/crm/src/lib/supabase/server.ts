import { createServerClient } from "@supabase/ssr";
import type { Database } from "@clean-app/db";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";

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

export function createAdminClient() {
  const configuration = z.object({
    secretKey: z.string().min(1),
    url: z.url(),
  }).safeParse({
    secretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (!configuration.success) {
    throw new Error("Supabase Admin is not configured.");
  }

  return createSupabaseClient<Database>(
    configuration.data.url,
    configuration.data.secretKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
