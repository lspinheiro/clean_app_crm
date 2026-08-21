import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { defaultLocale, isAppLocale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

type ConfirmationRouteContext = {
  params: Promise<{ locale: string }>;
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
  const { locale: requestedLocale } = await context.params;
  const locale = isAppLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const requestedEmployeeInvitation = request.nextUrl.searchParams.get("employeeInvitation");
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
