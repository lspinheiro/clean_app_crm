import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { defaultLocale, isAppLocale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

type ConfirmationRouteContext = {
  /**
   * The employee invitation rides in the path rather than a query string. A redirect that
   * carries no query cannot be joined with the wrong separator: the invite template's
   * employee branch used `&` on the assumption a query was always there, and when Auth
   * refused the redirect and substituted `site_url` the invitee received
   * `https://cleaner.thecleancrew.app&token_hash=…`. It also lets `recovery.html`, which
   * cannot branch on invitation kind because `resetPasswordForEmail` takes no `data`, use
   * the same `?token_hash=` join as every other template.
   */
  params: Promise<{ invitation?: string[]; locale: string }>;
};

function acceptanceRedirect(locale: string, invalid = false, employeeInvitation?: string) {
  const params = new URLSearchParams();
  if (employeeInvitation) params.set("employeeInvitation", employeeInvitation);
  if (invalid) params.set("error", "invalid");
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const location = `/${locale}/invite/accept${query}`;
  return new NextResponse(null, {
    headers: { location },
    status: 307,
  });
}

export async function GET(request: NextRequest, context: ConfirmationRouteContext) {
  const { invitation, locale: requestedLocale } = await context.params;
  const locale = isAppLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const requestedEmployeeInvitation = invitation?.[0];
  const parsedEmployeeInvitation = z.uuid().safeParse(requestedEmployeeInvitation);
  const employeeInvitation = parsedEmployeeInvitation.success
    ? parsedEmployeeInvitation.data
    : undefined;

  if (!tokenHash || (type !== "invite" && type !== "recovery")) {
    return acceptanceRedirect(locale, true, employeeInvitation);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  return acceptanceRedirect(locale, Boolean(error), employeeInvitation);
}
