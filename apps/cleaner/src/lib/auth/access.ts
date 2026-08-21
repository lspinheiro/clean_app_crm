export type MembershipStatus = "active" | "removed";

export type AccessInput = {
  userId: string | null;
  profile: { id: string } | null;
  membership?: {
    profile_id: string | null;
    status: MembershipStatus | null;
  } | null;
  /**
   * Present only so callers can pass a token claim without it mattering: product authority
   * always comes from a database membership, never from user-controlled token metadata.
   */
  untrustedMetadataRole?: string;
};

export type AccessDecision =
  | { kind: "allowed"; userId: string }
  | {
      kind: "denied";
      reason:
        | "anonymous"
        | "missing_profile"
        | "missing_membership";
    };

export function evaluateCleanerAccess(input: AccessInput): AccessDecision {
  if (input.userId === null) return { kind: "denied", reason: "anonymous" };
  if (input.profile === null || input.profile.id !== input.userId) {
    return { kind: "denied", reason: "missing_profile" };
  }
  if (input.membership?.profile_id !== input.userId) {
    return { kind: "denied", reason: "missing_membership" };
  }
  return { kind: "allowed", userId: input.userId };
}
