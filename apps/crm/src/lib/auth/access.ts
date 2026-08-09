export type AppRole = "company_admin" | "cleaner" | "admin";

export type AccessInput = {
  userId: string | null;
  profile: { id: string; role: AppRole } | null;
  untrustedMetadataRole?: string;
};

export type AccessDecision =
  | { kind: "allowed"; userId: string }
  | { kind: "denied"; reason: "anonymous" | "missing_profile" | "wrong_role" };

export function evaluateCrmAccess(input: AccessInput): AccessDecision {
  if (input.userId === null) return { kind: "denied", reason: "anonymous" };
  if (input.profile === null || input.profile.id !== input.userId) {
    return { kind: "denied", reason: "missing_profile" };
  }
  if (input.profile.role !== "company_admin") {
    return { kind: "denied", reason: "wrong_role" };
  }
  return { kind: "allowed", userId: input.userId };
}
