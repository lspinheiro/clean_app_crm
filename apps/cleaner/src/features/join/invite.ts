import type { AppLocale } from "@/i18n/config";
import { cleanerTranslator } from "@/i18n/messages";

export type InviteState = "active" | "expired" | "revoked" | "unknown";

export type InvitePreview = {
  state: InviteState;
  companyName: string | null;
  cleanerCount: number;
};

const inviteStates: readonly string[] = ["active", "expired", "revoked", "unknown"];

export function isInviteState(value: string): value is InviteState {
  return inviteStates.includes(value);
}

export function normaliseInviteCode(rawCode: string) {
  return rawCode.trim().toUpperCase();
}

export function describeInviteProblem(
  preview: InvitePreview,
  locale: AppLocale = "en-AU",
): string {
  const t = cleanerTranslator(locale);
  const company = preview.companyName;

  switch (preview.state) {
    case "active":
      return "";
    case "expired":
      return company ? t("Join.inviteExpiredCompany", { company }) : t("Join.inviteExpired");
    case "revoked":
      return company ? t("Join.inviteRevokedCompany", { company }) : t("Join.inviteRevoked");
    case "unknown":
      return t("Join.inviteUnknown");
  }
}

// The RPC refuses with a fixed set of messages. Anything else is a bug or a race, and the
// cleaner sees a sentence rather than a database error.
export type JoinFailureKey =
  | "cleanerAccessRequired"
  | "joinError"
  | "joinExpired"
  | "joinInactive"
  | "joinUnknown"
  | "removed";

const joinFailureKeys: ReadonlyMap<string, Exclude<JoinFailureKey, "joinError">> = new Map([
  ["Invite code not found", "joinUnknown"],
  ["Invite code is no longer active", "joinInactive"],
  ["Invite code has expired", "joinExpired"],
  ["Cleaner access required", "cleanerAccessRequired"],
  ["This company removed you from their pool", "removed"],
]);

export function joinFailureKey(message: string): JoinFailureKey {
  return joinFailureKeys.get(message) ?? "joinError";
}

export function describeJoinFailure(message: string, locale: AppLocale = "en-AU"): string {
  return cleanerTranslator(locale)(`Join.${joinFailureKey(message)}`);
}

export function describeCleanerCount(
  cleanerCount: number,
  locale: AppLocale = "en-AU",
): string {
  const t = cleanerTranslator(locale);
  return cleanerCount <= 0
    ? t("Join.firstCleaner")
    : t("Join.cleanerCount", { count: cleanerCount });
}
