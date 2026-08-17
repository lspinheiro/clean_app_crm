import { type NextRequest, NextResponse } from "next/server";

import { defaultLocale, isAppLocale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

type ConfirmationRouteContext = {
  params: Promise<{ locale: string }>;
};

function acceptanceUrl(request: NextRequest, locale: string, invalid = false) {
  const path = `/${locale}/invite/accept${invalid ? "?error=invalid" : ""}`;
  return new URL(path, request.url);
}

export async function GET(request: NextRequest, context: ConfirmationRouteContext) {
  const { locale: requestedLocale } = await context.params;
  const locale = isAppLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (!tokenHash || (type !== "invite" && type !== "recovery")) {
    return NextResponse.redirect(acceptanceUrl(request, locale, true));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  return NextResponse.redirect(acceptanceUrl(request, locale, Boolean(error)));
}
