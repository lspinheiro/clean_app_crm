import { z } from "zod";

const offerStatusSchema = z.enum(["pending", "accepted", "declined", "revoked"]);
const localStartTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);

const sharedOfferRowSchema = z.object({
  offer_id: z.string().uuid(),
  status: offerStatusSchema,
  company_name: z.string().min(1),
  site_name: z.string().min(1),
  suburb: z.string().min(1),
  service_name: z.string().min(1),
  service_slug: z.string().nullable(),
  duration_minutes: z.number().int().positive(),
  cleaner_pay_cents: z.number().int().nonnegative(),
  crew_size: z.number().int().positive(),
});

const jobOfferRowSchema = sharedOfferRowSchema.extend({
  target_kind: z.literal("job"),
  scheduled_start: z.string().min(1),
  weekday: z.null(),
  local_start_time: z.null(),
  frequency: z.null(),
});

const seriesOfferRowSchema = sharedOfferRowSchema.extend({
  target_kind: z.literal("recurring_assignment"),
  scheduled_start: z.null(),
  weekday: z.number().int().min(1).max(7),
  local_start_time: localStartTimeSchema,
  frequency: z.enum(["weekly", "fortnightly"]),
});

export const offerRowsSchema = z.array(
  z.discriminatedUnion("target_kind", [jobOfferRowSchema, seriesOfferRowSchema]),
);

export type OfferStatus = z.infer<typeof offerStatusSchema>;
export type RecurrenceFrequency = "weekly" | "fortnightly";

type OfferCore = {
  id: string;
  status: OfferStatus;
  companyName: string;
  siteName: string;
  suburb: string;
  serviceName: string;
  serviceSlug: string | null;
  durationMinutes: number;
  cleanerPayCents: number;
  crewSize: number;
};

export type CleanerOffer = OfferCore &
  (
    | {
        target: { kind: "job"; scheduledStart: string };
      }
    | {
        target: {
          kind: "recurring_assignment";
          weekday: number;
          localStartTime: string;
          frequency: RecurrenceFrequency;
        };
      }
  );

export function parseOffers(value: unknown): CleanerOffer[] {
  return offerRowsSchema.parse(value).map((row) => {
    const core: OfferCore = {
      id: row.offer_id,
      status: row.status,
      companyName: row.company_name,
      siteName: row.site_name,
      suburb: row.suburb,
      serviceName: row.service_name,
      serviceSlug: row.service_slug,
      durationMinutes: row.duration_minutes,
      cleanerPayCents: row.cleaner_pay_cents,
      crewSize: row.crew_size,
    };

    switch (row.target_kind) {
      case "job":
        return {
          ...core,
          target: {
            kind: "job" as const,
            scheduledStart: row.scheduled_start,
          },
        };
      case "recurring_assignment":
        return {
          ...core,
          target: {
            kind: "recurring_assignment" as const,
            weekday: row.weekday,
            localStartTime: row.local_start_time,
            frequency: row.frequency,
          },
        };
    }
  });
}
