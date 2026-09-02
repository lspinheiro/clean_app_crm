export function normaliseInviteCode(rawCode: string) {
  return rawCode.trim().toUpperCase();
}

// The RPC refuses with a fixed set of messages. Anything else is a bug or a race, and the
// cleaner sees a sentence rather than a database error.
export type JoinFailureKey =
  | "alreadyApplied"
  | "alreadyStaff"
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
  ["Already on this company's cleaner staff", "alreadyStaff"],
  ["Regular posting applications are not available to existing cleaner staff", "alreadyStaff"],
  ["Cleaner can apply only once per job", "alreadyApplied"],
  ["Cleaner can apply only once per recurring assignment", "alreadyApplied"],
]);

export function joinFailureKey(message: string): JoinFailureKey {
  return joinFailureKeys.get(message) ?? "joinError";
}
