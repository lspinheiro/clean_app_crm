import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { isMissingSessionError, isStaleSessionError } from "@/lib/auth/session-error";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { publishableKey, url } = getSupabaseBrowserEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.getUser();
  if (error) {
    if (isStaleSessionError(error)) {
      // Drop the dead cookie so /join and /login stay reachable instead of 500-ing.
      await supabase.auth.signOut({ scope: "local" });
    } else if (!isMissingSessionError(error)) {
      throw error;
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
