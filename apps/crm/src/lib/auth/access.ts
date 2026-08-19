export type EmployeeRole = "owner" | "staff";
export type MembershipStatus = "active" | "removed";

export type AccessInput = {
  userId: string | null;
  profile: { id: string } | null;
  membership?: {
    company_id: string;
    profile_id: string;
    role: EmployeeRole;
    status: MembershipStatus;
  } | null;
  companyStatus?: "pending" | "approved" | "suspended" | null;
  untrustedMetadataRole?: string;
};

export type AccessDecision =
  | { kind: "allowed"; userId: string }
  | {
      kind: "denied";
      reason:
        | "anonymous"
        | "missing_profile"
        | "missing_membership"
        | "inactive_membership"
        | "company_not_approved";
    };

export function evaluateCrmAccess(input: AccessInput): AccessDecision {
  if (input.userId === null) return { kind: "denied", reason: "anonymous" };
  if (input.profile === null || input.profile.id !== input.userId) {
    return { kind: "denied", reason: "missing_profile" };
  }
  if (input.membership?.profile_id !== input.userId) {
    return { kind: "denied", reason: "missing_membership" };
  }
  if (input.membership.status !== "active") {
    return { kind: "denied", reason: "inactive_membership" };
  }
  if (input.companyStatus !== undefined && input.companyStatus !== "approved") {
    return { kind: "denied", reason: "company_not_approved" };
  }
  return { kind: "allowed", userId: input.userId };
}
