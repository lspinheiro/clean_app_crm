import { z } from "zod";

import type {
  OneTimePostingOption,
  PostingSummary,
  RegularPostingOption,
} from "./types";

export const postingClosingReasonSchema = z.enum([
  "expired",
  "revoked",
  "cap_reached",
  "filled",
  "start_passed",
  "work_unavailable",
]);

const postingRowSchema = z.object({
  application_count: z.number().int().nonnegative(),
  closing_reason: postingClosingReasonSchema.nullable(),
  code: z.string().regex(/^[A-Z0-9]{16}$/),
  created_at: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  intent: z.enum(["expression_of_interest", "one_time", "regular"]),
  public_description: z.string().min(1).max(2000),
  state: z.enum(["active", "dead"]),
}).superRefine((row, context) => {
  if (
    (row.state === "active" && row.closing_reason !== null)
    || (row.state === "dead" && row.closing_reason === null)
  ) {
    context.addIssue({
      code: "custom",
      message: "Posting state and closing reason do not match",
      path: ["closing_reason"],
    });
  }
});

export function parsePostingRows(value: unknown): PostingSummary[] {
  const parsed = z.array(postingRowSchema).safeParse(value);
  if (!parsed.success) {
    throw new Error("Posting data did not match the database contract");
  }
  return parsed.data.map((row) => ({
    applicationCount: row.application_count,
    closingReason: row.closing_reason,
    code: row.code,
    createdAt: row.created_at,
    id: row.id,
    intent: row.intent,
    publicDescription: row.public_description,
    state: row.state === "active" ? "active" : "closed",
  }));
}

const serviceSchema = z.object({ name: z.string().min(1), slug: z.string().min(1) });
const siteSchema = z.object({ name: z.string().min(1), suburb: z.string().min(1) });

const oneTimeOptionRowSchema = z.object({
  cleaner_pay_cents: z.number().int().positive(),
  duration_minutes: z.number().int().positive(),
  job_id: z.uuid(),
  scheduled_start: z.iso.datetime({ offset: true }),
  service_catalogue: serviceSchema,
  sites: siteSchema,
});

const regularOptionRowSchema = z.object({
  active: z.literal(true),
  cleaner_pay_cents: z.number().int().positive(),
  crew_size: z.number().int().positive(),
  duration_minutes: z.number().int().positive(),
  frequency: z.enum(["weekly", "fortnightly"]),
  id: z.uuid(),
  local_start_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  recurring_assignment_cleaners: z.array(z.object({ cleaner_id: z.uuid() })),
  service_catalogue: serviceSchema,
  sites: siteSchema,
  weekday: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
  ]),
});

type ServiceLabel = (service: z.infer<typeof serviceSchema>) => string;

export function parseOneTimePostingOptions(
  value: unknown,
  serviceLabel: ServiceLabel,
): OneTimePostingOption[] {
  const parsed = z.array(oneTimeOptionRowSchema).safeParse(value);
  if (!parsed.success) throw new Error("Job posting options did not match the database contract");

  const options = new Map<string, OneTimePostingOption>();
  for (const row of parsed.data) {
    if (options.has(row.job_id)) continue;
    options.set(row.job_id, {
      cleanerPayCents: row.cleaner_pay_cents,
      durationMinutes: row.duration_minutes,
      id: row.job_id,
      intent: "one_time",
      scheduledStart: row.scheduled_start,
      serviceName: serviceLabel(row.service_catalogue),
      siteName: row.sites.name,
      suburb: row.sites.suburb,
    });
  }
  return [...options.values()];
}

export function parseRegularPostingOptions(
  value: unknown,
  serviceLabel: ServiceLabel,
): RegularPostingOption[] {
  const parsed = z.array(regularOptionRowSchema).safeParse(value);
  if (!parsed.success) {
    throw new Error("Recurring posting options did not match the database contract");
  }
  return parsed.data.flatMap((row) => (
    row.recurring_assignment_cleaners.length < row.crew_size
      ? [{
          cleanerPayCents: row.cleaner_pay_cents,
          durationMinutes: row.duration_minutes,
          frequency: row.frequency,
          id: row.id,
          intent: "regular" as const,
          localStartTime: row.local_start_time,
          serviceName: serviceLabel(row.service_catalogue),
          siteName: row.sites.name,
          suburb: row.sites.suburb,
          weekday: row.weekday,
        }]
      : []
  ));
}
