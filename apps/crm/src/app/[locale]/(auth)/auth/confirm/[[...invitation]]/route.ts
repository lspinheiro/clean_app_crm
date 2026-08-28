import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { defaultLocale, isAppLocale } from "@/i18n/config";
import {
  encodePendingConfirmation,
  pendingConfirmationCookieName,
  pendingConfirmationMaxAgeSeconds,
} from "@/lib/auth/pending-confirmation";

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

/**
 * Parks the token the e-mail carried; it is spent by `continuePendingConfirmationAction` when
 * somebody presses Continue.
 *
 * This handler used to call `verifyOtp`, which made fetching the link the act that used it.
 * Everything that fetches a link on the invitee's behalf therefore destroyed the invitation
 * before the invitee saw it, and confirmed the account while it was at it — leaving an address
 * that could not be re-invited and a password nobody had ever chosen. A GET does not mutate
 * now; it hands over.
 *
 * The URL is unchanged, so every link already in an inbox keeps working and the hosted
 * redirect allow-list is untouched.
 */
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

  const response = acceptanceRedirect(locale, false, employeeInvitation);
  response.cookies.set(
    pendingConfirmationCookieName,
    encodePendingConfirmation({ tokenHash, type }),
    {
      httpOnly: true,
      maxAge: pendingConfirmationMaxAgeSeconds,
      path: "/",
      sameSite: "lax",
      // Derived from the request rather than the build: a `Secure` cookie is dropped over
      // plain http, which is every local run and every acceptance test.
      secure: request.nextUrl.protocol === "https:",
    },
  );

  // The redirect drops the query, so the token is gone from the address bar and from history
  // after this hop. A live one was pasted into a chat twice while this flow was being debugged.
  return response;
}
