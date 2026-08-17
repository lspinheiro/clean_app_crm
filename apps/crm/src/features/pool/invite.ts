const inviteCodePattern = /^[A-Z0-9]{6}$/;

function assertInviteCode(code: string) {
  if (!inviteCodePattern.test(code)) {
    throw new Error("Invite code must contain six uppercase letters or numbers.");
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
  locale = "en-AU",
) {
  assertInviteCode(code);
  return locale === "pt-BR"
    ? `Entre para o banco de profissionais da empresa ${companyName}: ${joinUrl}\nCódigo de convite: ${code}`
    : `Join ${companyName}'s cleaner pool: ${joinUrl}\nInvite code: ${code}`;
}

export function isInviteActive(expiresAt: string | null, now = new Date()) {
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

export function formatJoinedDate(joinedAt: string, locale = "en-AU") {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Brisbane",
  }).format(new Date(joinedAt));
}
