import { z } from "zod";

const deadPostingSchema = z.object({
  closing_reason: z.string().nullable(),
  state: z.literal("dead"),
});

const activePostingBaseSchema = z.object({
  company_name: z.string().trim().min(1),
  public_description: z.string().trim().min(1),
  state: z.literal("active"),
});

const expressionOfInterestSchema = activePostingBaseSchema.extend({
  intent: z.literal("expression_of_interest"),
});

const workPostingSchema = activePostingBaseSchema.extend({
  cleaner_pay_cents: z.number().int().nonnegative(),
  duration_minutes: z.number().int().positive(),
  service_name: z.string().trim().min(1),
  service_slug: z.string().nullable(),
  suburb: z.string().trim().min(1),
});

const oneTimePostingSchema = workPostingSchema.extend({
  intent: z.literal("one_time"),
  scheduled_start: z.iso.datetime({ offset: true }),
});

const regularPostingSchema = workPostingSchema.extend({
  frequency: z.enum(["weekly", "fortnightly"]),
  intent: z.literal("regular"),
  local_start_time: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/),
  weekday: z.number().int().min(1).max(7),
});

export type ExpressionOfInterestPosting = {
  companyName: string;
  intent: "expression_of_interest";
  publicDescription: string;
  state: "active";
};

type WorkPostingBase = {
  cleanerPayCents: number;
  companyName: string;
  durationMinutes: number;
  publicDescription: string;
  serviceName: string;
  serviceSlug: string | null;
  state: "active";
  suburb: string;
};

export type OneTimePosting = WorkPostingBase & {
  intent: "one_time";
  scheduledStart: string;
};

export type RegularPosting = WorkPostingBase & {
  frequency: "weekly" | "fortnightly";
  intent: "regular";
  localStartTime: string;
  weekday: number;
};

export type ActivePosting =
  | ExpressionOfInterestPosting
  | OneTimePosting
  | RegularPosting;

export type PostingPreview =
  | ActivePosting
  | { closingReason: string | null; state: "dead" };

export type VisitorRelationship =
  | "admitted"
  | "none"
  | "rejected"
  | "removed"
  | "staff"
  | "waiting";

const unknownPosting: PostingPreview = { closingReason: "unknown", state: "dead" };

function workFields(row: z.infer<typeof workPostingSchema>): WorkPostingBase {
  return {
    cleanerPayCents: row.cleaner_pay_cents,
    companyName: row.company_name,
    durationMinutes: row.duration_minutes,
    publicDescription: row.public_description,
    serviceName: row.service_name,
    serviceSlug: row.service_slug,
    state: "active",
    suburb: row.suburb,
  };
}

export function parsePostingPreview(value: unknown): PostingPreview {
  const dead = deadPostingSchema.safeParse(value);
  if (dead.success) {
    return { closingReason: dead.data.closing_reason, state: "dead" };
  }

  const expressionOfInterest = expressionOfInterestSchema.safeParse(value);
  if (expressionOfInterest.success) {
    return {
      companyName: expressionOfInterest.data.company_name,
      intent: "expression_of_interest",
      publicDescription: expressionOfInterest.data.public_description,
      state: "active",
    };
  }

  const oneTime = oneTimePostingSchema.safeParse(value);
  if (oneTime.success) {
    return {
      ...workFields(oneTime.data),
      intent: "one_time",
      scheduledStart: oneTime.data.scheduled_start,
    };
  }

  const regular = regularPostingSchema.safeParse(value);
  if (regular.success) {
    return {
      ...workFields(regular.data),
      frequency: regular.data.frequency,
      intent: "regular",
      localStartTime: regular.data.local_start_time,
      weekday: regular.data.weekday,
    };
  }

  return unknownPosting;
}

const joinRequestRowsSchema = z.array(z.object({
  company_id: z.uuid(),
  company_name: z.string().nullable(),
  join_request_state: z.enum(["waiting", "admitted", "rejected"]).nullable(),
}));

const membershipRowsSchema = z.array(z.object({
  company_id: z.uuid(),
  company_name: z.string().nullable(),
  status: z.enum(["active", "removed"]).nullable(),
}));

export function parseVisitorRelationship(
  requestValue: unknown,
  membershipValue: unknown,
  companyName: string,
): VisitorRelationship | null {
  const requests = joinRequestRowsSchema.safeParse(requestValue);
  const memberships = membershipRowsSchema.safeParse(membershipValue);
  if (!requests.success || !memberships.success) return null;

  const matchingRequests = requests.data.filter((row) => row.company_name === companyName);
  const matchingMemberships = memberships.data.filter((row) => row.company_name === companyName);
  const companyIds = new Set([
    ...matchingRequests.map((row) => row.company_id),
    ...matchingMemberships.map((row) => row.company_id),
  ]);

  // PARTIAL guard only: it removes nondeterminism when this visitor has rows for multiple
  // same-named companies. A single row can still be misattributed because posting_preview
  // omits company_id; CLE-111 carries the complete identity-based fix.
  if (companyIds.size > 1) return "none";

  const membership = matchingMemberships[0];
  if (membership?.status === "active") return "staff";
  if (membership?.status === "removed") return "removed";

  const request = matchingRequests[0];
  return request?.join_request_state ?? "none";
}
