import { z } from "zod";

import { createClientSchema } from "@/features/clients/schema";

const optionalAccessNotes = z
  .string()
  .trim()
  .max(2_000, "Use 2,000 characters or fewer.")
  .transform((value) => value || null);

const durationHours = z.coerce
  .number<number>()
  .finite("Enter a valid duration.")
  .positive("Enter a duration greater than zero.");

const rateAud = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid AUD amount with up to two decimals.")
  .refine((value) => Number(value) > 0, "Enter a rate greater than zero.");

export const updateClientSchema = createClientSchema.extend({
  clientId: z.string().uuid("Choose a valid client."),
});

export const updateSiteSchema = z
  .object({
    clientId: z.string().uuid("Choose a valid client."),
    siteId: z.string().uuid("Choose a valid site."),
    name: z.string().trim().min(1, "Enter a site name.").max(120, "Use 120 characters or fewer."),
    address: z.string().trim().min(1, "Enter a street address.").max(240, "Use 240 characters or fewer."),
    suburb: z.string().trim().min(1, "Enter a suburb.").max(120, "Use 120 characters or fewer."),
    accessNotes: optionalAccessNotes,
    defaultServiceId: z.string().uuid("Choose a default service."),
    durationHours,
    rateAud,
  })
  .transform((value) => ({
    ...value,
    durationMinutes: Math.round(value.durationHours * 60),
    rateCents: Math.round(Number(value.rateAud) * 100),
  }));
