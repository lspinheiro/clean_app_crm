import { z } from "zod";

import { createClientSchema } from "@/features/clients/schema";
import { userMessage } from "@/i18n/user-message";

const optionalAccessNotes = z
  .string()
  .trim()
  .max(2_000, userMessage("max2000"))
  .transform((value) => value || null);

const durationHours = z.coerce
  .number<number>()
  .finite(userMessage("validDuration"))
  .positive(userMessage("durationPositive"));

const rateAud = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, userMessage("validAud"))
  .refine((value) => Number(value) > 0, userMessage("ratePositive"));

export const updateClientSchema = createClientSchema.extend({
  clientId: z.string().uuid(userMessage("chooseValidClient")),
});

export const updateSiteSchema = z
  .object({
    clientId: z.string().uuid(userMessage("chooseValidClient")),
    siteId: z.string().uuid(userMessage("chooseValidSite")),
    name: z.string().trim().min(1, userMessage("enterSiteName")).max(120, userMessage("max120")),
    address: z.string().trim().min(1, userMessage("enterStreetAddress")).max(240, userMessage("max240")),
    suburb: z.string().trim().min(1, userMessage("enterSuburb")).max(120, userMessage("max120")),
    accessNotes: optionalAccessNotes,
    defaultServiceId: z.string().uuid(userMessage("chooseDefaultService")),
    durationHours,
    rateAud,
  })
  .transform((value) => ({
    ...value,
    durationMinutes: Math.round(value.durationHours * 60),
    rateCents: Math.round(Number(value.rateAud) * 100),
  }));
