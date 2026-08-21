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

export function describeInviteProblem(preview: InvitePreview): string {
  const company = preview.companyName;

  switch (preview.state) {
    case "active":
      return "";
    case "expired":
      return company
        ? `This invite link from ${company} has expired. Ask them for a new link.`
        : "This invite link has expired. Ask the company for a new link.";
    case "revoked":
      return company
        ? `This invite link from ${company} is no longer in use. Ask them for a new link.`
        : "This invite link is no longer in use. Ask the company for a new link.";
    case "unknown":
      return "We do not know this invite link. Check the link, or ask the company to send it again.";
  }
}

// The RPC refuses with a fixed set of messages. Anything else is a bug or a race, and the
// cleaner sees a sentence rather than a database error.
const joinFailures: ReadonlyMap<string, string> = new Map([
  ["Invite code not found", "We do not know this invite link. Ask the company to send it again."],
  [
    "Invite code is no longer active",
    "This invite link is no longer in use. Ask the company for a new link.",
  ],
  ["Invite code has expired", "This invite link has expired. Ask the company for a new link."],
  ["Cleaner access required", "This app is for cleaners. Sign in with your cleaner account."],
  [
    // Key is the RPC's own message, verbatim; only the sentence we show is ours.
    "This company removed you from their pool",
    "This company removed you. Ask them to add you again.",
  ],
]);

export function describeJoinFailure(message: string): string {
  return joinFailures.get(message) ?? "We could not add you to this company. Please try again.";
}

export function describeCleanerCount(cleanerCount: number): string {
  if (cleanerCount <= 0) return "You would be their first cleaner.";
  if (cleanerCount === 1) return "1 cleaner already works with them.";
  return `${cleanerCount} cleaners already work with them.`;
}
