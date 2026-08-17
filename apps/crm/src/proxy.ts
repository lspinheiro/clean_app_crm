import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { isRecoverableAuthSessionError } from "@/lib/auth/errors";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const pendingCookies: Parameters<NonNullable<CookieMethodsServer["setAll"]>>[0] = [];
  const pendingHeaders: Record<string, string> = {};
  const { publishableKey, url } = getSupabaseBrowserEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        pendingCookies.push(...cookiesToSet);
        Object.entries(headers).forEach(([name, value]) => {
          pendingHeaders[name] = value;
        });
      },
    },
  });

  const { error } = await supabase.auth.getUser();
  if (error && !isRecoverableAuthSessionError(error)) throw error;

  const response = handleI18nRouting(request);
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  Object.entries(pendingHeaders).forEach(([name, value]) => {
    response.headers.set(name, value);
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\..*).*)",
  ],
};
