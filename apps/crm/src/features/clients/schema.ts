import { z } from "zod";

import { userMessage } from "@/i18n/user-message";

const optionalText = (maximum: number, message: string) =>
  z
    .string()
    .trim()
    .max(maximum, message)
    .transform((value) => value || null);

export const createClientSchema = z.object({
  name: z.string().trim().min(1, userMessage("enterClientName")).max(120, userMessage("max120")),
  contactName: optionalText(120, userMessage("max120")),
  phone: optionalText(40, userMessage("max40")),
  notes: optionalText(2_000, userMessage("max2000")),
});

export const createSiteSchema = z.object({
  clientId: z.string().uuid(userMessage("chooseValidClient")),
  name: z.string().trim().min(1, userMessage("enterSiteName")).max(120, userMessage("max120")),
  address: z.string().trim().min(1, userMessage("enterStreetAddress")).max(240, userMessage("max240")),
  suburb: z.string().trim().min(1, userMessage("enterSuburb")).max(120, userMessage("max120")),
  accessNotes: optionalText(2_000, userMessage("max2000")),
});

export function firstFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}
