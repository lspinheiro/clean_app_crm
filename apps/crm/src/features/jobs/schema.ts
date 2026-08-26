import { z } from "zod";

import { userMessage } from "@/i18n/user-message";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, userMessage("validJobDate"))
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, userMessage("validJobDate"));

const audAmount = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, userMessage("validAud"))
  .refine((value) => Number(value) > 0, userMessage("cleanerPayPositive"));

const optionalAudAmount = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d+(?:\.\d{1,2})?$/.test(value),
    userMessage("validAud"),
  )
  .refine(
    (value) => value === "" || Number(value) > 0,
    userMessage("clientChargePositive"),
  );

export const oneOffJobSchema = z
  .object({
    clientId: z.string().uuid(userMessage("chooseClient")),
    siteId: z.string(),
    serviceId: z.string().uuid(userMessage("chooseService")),
    date: isoDate,
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, userMessage("validStartTime")),
    durationHours: z.coerce
      .number<number>()
      .finite(userMessage("validDuration"))
      .positive(userMessage("durationPositive"))
      .refine(
        (value) => Math.round(value * 60) >= 1,
        userMessage("durationMinute"),
      ),
    cleanerPayAud: audAmount,
    clientChargeAud: optionalAudAmount,
    crewSize: z.coerce
      .number<number>()
      .int(userMessage("crewWhole"))
      .min(1, userMessage("crewMin"))
      .max(20, userMessage("crewMax20")),
    notes: z
      .string()
      .trim()
      .max(2000, userMessage("max2000")),
    mode: z.enum(["draft", "post"]),
  })
  .superRefine((value, context) => {
    if (
      z.string().uuid().safeParse(value.clientId).success &&
      !z.string().uuid().safeParse(value.siteId).success
    ) {
      context.addIssue({
        code: "custom",
        message: userMessage("chooseSite"),
        path: ["siteId"],
      });
    }
  })
  .transform((value) => ({
    ...value,
    durationMinutes: Math.round(value.durationHours * 60),
    cleanerPayCents: Math.round(Number(value.cleanerPayAud) * 100),
    clientChargeCents:
      value.clientChargeAud === ""
        ? null
        : Math.round(Number(value.clientChargeAud) * 100),
    notes: value.notes || null,
    postNow: value.mode === "post",
  }));

export const assignJobSlotSchema = z.object({
  jobId: z.string().uuid(),
  slotNumber: z.coerce.number<number>().int().min(1),
  cleanerId: z.string().uuid(),
});

export const jobOfferSchema = z.object({
  jobId: z.string().uuid(),
  cleanerId: z.string().uuid(),
});

export const jobOfferRevocationSchema = z.object({
  jobId: z.string().uuid(),
  offerId: z.string().uuid(),
});

export const applicationReviewIdentitySchema = z.object({
  jobId: z.string().uuid(),
  cleanerId: z.string().uuid(),
});

export const approveJobApplicationSchema = applicationReviewIdentitySchema.extend({
  slotNumber: z.coerce.number<number>().int().min(1),
});

export const jobIdSchema = z.string().uuid();

export function firstJobFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}
