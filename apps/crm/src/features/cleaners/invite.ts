const inviteCodePattern = /^[A-Z0-9]{16}$/;
const joinedDateFormatters = new Map<string, Intl.DateTimeFormat>();

function assertInviteCode(code: string) {
  if (!inviteCodePattern.test(code)) {
    throw new Error("Invite code must contain sixteen uppercase letters or numbers.");
  }
}

export function buildCleanerJoinUrl(cleanerAppUrl: string, code: string) {
  assertInviteCode(code);
  const joinUrl = new URL(normaliseCleanerAppUrl(cleanerAppUrl));
  joinUrl.pathname = "/join";
  joinUrl.searchParams.set("code", code);
  return joinUrl.toString();
}

export function normaliseCleanerAppUrl(cleanerAppUrl: string) {
  const baseUrl = new URL(cleanerAppUrl);
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error("Cleaner app URL must use HTTP or HTTPS.");
  }
  return baseUrl.origin;
}

export function buildInviteMessage(
  companyName: string,
  joinUrl: string,
  code: string,
  translate: (values: { companyName: string; joinUrl: string; code: string }) => string,
) {
  assertInviteCode(code);
  return translate({ companyName, joinUrl, code });
}

export function buildWhatsAppShareUrl(inviteMessage: string) {
  return `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`;
}

export function isInviteActive(expiresAt: string | null, now = new Date()) {
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

export function formatJoinedDate(joinedAt: string, locale = "en-AU") {
  let formatter = joinedDateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Australia/Brisbane",
    });
    joinedDateFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(joinedAt));
}
