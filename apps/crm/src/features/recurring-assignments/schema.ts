import { z } from "zod";

import { userMessage } from "@/i18n/user-message";

const optionalRecurringAssignmentId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().uuid(userMessage("validRecurringAssignment")).optional(),
);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, userMessage("validFirstServiceDate"))
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, userMessage("validFirstServiceDate"));

const audAmount = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, userMessage("validAud"))
  .refine((value) => Number(value) > 0, userMessage("cleanerPayPositive"));

const cleanerId = z.union([
  z.literal(""),
  z.string().uuid(userMessage("activeCleaner")),
]);

export const recurringAssignmentSchema = z
  .object({
    clientId: z.string().uuid(userMessage("chooseValidClient")),
    siteId: z.string().uuid(userMessage("chooseValidSite")),
    recurringAssignmentId: optionalRecurringAssignmentId,
    serviceId: z.string().uuid(userMessage("chooseService")),
    frequency: z.enum(["weekly", "fortnightly"]),
    anchorDate: isoDate,
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, userMessage("validStartTime")),
    durationHours: z.coerce
      .number<number>()
      .finite(userMessage("validDuration"))
      .positive(userMessage("durationPositive"))
      .max(24, userMessage("duration24Max")),
    cleanerPayAud: audAmount,
    crewSize: z.coerce
      .number<number>()
      .int(userMessage("crewWhole"))
      .min(1, userMessage("crewMin"))
      .max(20, userMessage("crewMax20")),
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
        message: userMessage("namedOrder"),
        path: ["cleanerIds"],
      });
    }
    if (selectedIds.length > value.crewSize) {
      context.addIssue({
        code: "custom",
        message: userMessage("namedWithinCrew"),
        path: ["cleanerIds"],
      });
    }
    if (new Set(selectedIds).size !== selectedIds.length) {
      context.addIssue({
        code: "custom",
        message: userMessage("namedUnique"),
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
  clientId: z.string().uuid(userMessage("chooseValidClient")),
  recurringAssignmentId: z.string().uuid(userMessage("validRecurringAssignment")),
  active: z.boolean(),
});

export type RecurringAssignmentInput = z.input<typeof recurringAssignmentSchema>;
