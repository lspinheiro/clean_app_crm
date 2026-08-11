import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid job date.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Choose a valid job date.");

const audAmount = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid AUD amount with up to two decimals.")
  .refine((value) => Number(value) > 0, "Enter cleaner pay greater than zero.");

const optionalAudAmount = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d+(?:\.\d{1,2})?$/.test(value),
    "Enter a valid AUD amount with up to two decimals.",
  )
  .refine(
    (value) => value === "" || Number(value) > 0,
    "Enter a client charge greater than zero.",
  );

export const oneOffJobSchema = z
  .object({
    siteId: z.string().uuid("Choose a site."),
    serviceId: z.string().uuid("Choose a service."),
    date: isoDate,
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid start time."),
    durationHours: z.coerce
      .number<number>()
      .finite("Enter a valid duration.")
      .positive("Enter a duration greater than zero.")
      .refine(
        (value) => Math.round(value * 60) >= 1,
        "Enter a duration of at least one minute.",
      ),
    cleanerPayAud: audAmount,
    clientChargeAud: optionalAudAmount,
    crewSize: z.coerce
      .number<number>()
      .int("Crew size must be a whole number.")
      .min(1, "Crew size must be at least one."),
    notes: z
      .string()
      .trim()
      .max(2000, "Use 2,000 characters or fewer."),
    mode: z.enum(["draft", "post"]),
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
