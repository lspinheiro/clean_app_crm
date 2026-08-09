import { z } from "zod";

const optionalRecurringAssignmentId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().uuid("Choose a valid recurring assignment.").optional(),
);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid first service date.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Choose a valid first service date.");

const audAmount = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid AUD amount with up to two decimals.")
  .refine((value) => Number(value) > 0, "Enter cleaner pay greater than zero.");

const cleanerId = z.union([
  z.literal(""),
  z.string().uuid("Choose cleaners from the active pool."),
]);

export const recurringAssignmentSchema = z
  .object({
    clientId: z.string().uuid("Choose a valid client."),
    siteId: z.string().uuid("Choose a valid site."),
    recurringAssignmentId: optionalRecurringAssignmentId,
    serviceId: z.string().uuid("Choose a service."),
    frequency: z.enum(["weekly", "fortnightly"]),
    anchorDate: isoDate,
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid start time."),
    durationHours: z.coerce
      .number<number>()
      .finite("Enter a valid duration.")
      .positive("Enter a duration greater than zero.")
      .max(24, "Use a duration of 24 hours or less."),
    cleanerPayAud: audAmount,
    crewSize: z.coerce
      .number<number>()
      .int("Crew size must be a whole number.")
      .min(1, "Crew size must be at least one.")
      .max(20, "Crew size must be 20 or fewer."),
    cleanerIds: z.array(cleanerId).default([]),
  })
  .superRefine((value, context) => {
    const selectedIds = value.cleanerIds.filter(Boolean);
    const firstOpenIndex = value.cleanerIds.findIndex((cleaner) => !cleaner);
    if (
      firstOpenIndex >= 0 &&
      value.cleanerIds.slice(firstOpenIndex + 1).some(Boolean)
    ) {
      context.addIssue({
        code: "custom",
        message: "Fill named cleaner slots in order.",
        path: ["cleanerIds"],
      });
    }
    if (selectedIds.length > value.crewSize) {
      context.addIssue({
        code: "custom",
        message: "Named cleaners cannot exceed crew size.",
        path: ["cleanerIds"],
      });
    }
    if (new Set(selectedIds).size !== selectedIds.length) {
      context.addIssue({
        code: "custom",
        message: "Choose each named cleaner only once.",
        path: ["cleanerIds"],
      });
    }
  })
  .transform((value) => {
    const date = new Date(`${value.anchorDate}T00:00:00Z`);
    const utcDay = date.getUTCDay();
    return {
      ...value,
      cleanerIds: value.cleanerIds.filter(Boolean),
      weekday: utcDay === 0 ? 7 : utcDay,
      durationMinutes: Math.round(value.durationHours * 60),
      cleanerPayCents: Math.round(Number(value.cleanerPayAud) * 100),
    };
  });

export const recurringAssignmentActiveSchema = z.object({
  clientId: z.string().uuid("Choose a valid client."),
  recurringAssignmentId: z.string().uuid("Choose a valid recurring assignment."),
  active: z.boolean(),
});

export type RecurringAssignmentInput = z.input<typeof recurringAssignmentSchema>;
