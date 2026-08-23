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

export type InviteProblem = {
  key:
    | "inviteExpired"
    | "inviteExpiredCompany"
    | "inviteRevoked"
    | "inviteRevokedCompany"
    | "inviteUnknown";
  values?: { company: string };
};

export function inviteProblem(preview: InvitePreview): InviteProblem | null {
  const company = preview.companyName;

  switch (preview.state) {
    case "active":
      return null;
    case "expired":
      return company
        ? { key: "inviteExpiredCompany", values: { company } }
        : { key: "inviteExpired" };
    case "revoked":
      return company
        ? { key: "inviteRevokedCompany", values: { company } }
        : { key: "inviteRevoked" };
    case "unknown":
      return { key: "inviteUnknown" };
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

export function cleanerCountCopy(cleanerCount: number) {
  return cleanerCount <= 0
    ? { key: "firstCleaner" as const, values: undefined }
    : { key: "cleanerCount" as const, values: { count: cleanerCount } };
}
